import { EMBED_DIM, env } from "@/lib/env";
import { normalize } from "@/lib/pipeline/vector";
import { ProviderError, providerError } from "./errors";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

function key() {
  const k = env.geminiKey();
  if (!k) throw new ProviderError("gemini", 401, "GEMINI_API_KEY is not set");
  return k;
}

async function post(path: string, body: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}`, {
      method: "POST",
      headers: { "x-goog-api-key": key(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new ProviderError("gemini", 0, (e as Error).message);
  }
  if (!res.ok) throw await providerError("gemini", res);
  return res.json();
}

type Part = { text: string } | { fileData: { fileUri: string; mimeType?: string }; videoMetadata?: Record<string, string> };

export type GeminiOptions = {
  system: string;
  parts: Part[];
  model?: string;
  json?: boolean;
  temperature?: number;
  lowMediaResolution?: boolean;
};

export async function geminiGenerate(o: GeminiOptions): Promise<string> {
  const model = o.model ?? env.geminiLlmModel();
  const base: Record<string, unknown> = { temperature: o.temperature ?? 0.2 };
  if (o.json) base.responseMimeType = "application/json";
  // optional tuning: low thinking keeps Gemini 3.x fast and within free-tier token limits
  const tuned: Record<string, unknown> = { ...base };
  if (o.lowMediaResolution) tuned.mediaResolution = "MEDIA_RESOLUTION_LOW";
  if (/^gemini-[3-9]/.test(model)) tuned.thinkingConfig = { thinkingLevel: "low" };

  const request = (generationConfig: Record<string, unknown>) =>
    post(`models/${model}:generateContent`, {
      systemInstruction: { parts: [{ text: o.system }] },
      contents: [{ role: "user", parts: o.parts }],
      generationConfig,
    });
  let raw: unknown;
  try {
    raw = await request(tuned);
  } catch (e) {
    // a model that rejects an optional setting still gets the request, without it
    if (e instanceof ProviderError && e.status === 400 && Object.keys(tuned).length > Object.keys(base).length) raw = await request(base);
    else throw e;
  }
  const data = raw as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (data.promptFeedback?.blockReason) throw new ProviderError("gemini", 400, `blocked: ${data.promptFeedback.blockReason}`);
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");
  if (!text.trim()) throw new ProviderError("gemini", 502, `empty answer (${data.candidates?.[0]?.finishReason ?? "no candidate"})`);
  return text;
}

export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY" | "FACT_VERIFICATION";

/**
 * Embeds texts in batches. gemini-embedding-001 is trained with Matryoshka
 * representation learning, so we can ask for 768 dimensions instead of 3072;
 * truncated vectors must be re-normalised before cosine similarity.
 */
export async function embed(texts: string[], task: EmbedTask): Promise<number[][]> {
  const model = env.geminiEmbedModel();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const data = (await post(`models/${model}:batchEmbedContents`, {
      requests: batch.map((t) => ({
        model: `models/${model}`,
        content: { parts: [{ text: t.slice(0, 6000) }] },
        taskType: task,
        outputDimensionality: EMBED_DIM,
      })),
    })) as { embeddings?: { values: number[] }[] };
    const vectors = data.embeddings ?? [];
    if (vectors.length !== batch.length) throw new ProviderError("gemini", 502, "embedding count mismatch");
    out.push(...vectors.map((v) => normalize(v.values)));
  }
  return out;
}
