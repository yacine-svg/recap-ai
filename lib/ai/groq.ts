import { env } from "@/lib/env";
import type { Segment } from "@/lib/types";
import { ProviderError, providerError } from "./errors";

const BASE = "https://api.groq.com/openai/v1";

function key() {
  const k = env.groqKey();
  if (!k) throw new ProviderError("groq", 401, "GROQ_API_KEY is not set");
  return k;
}

type WhisperSegment = {
  start: number;
  end: number;
  text: string;
  no_speech_prob?: number;
  avg_logprob?: number;
  compression_ratio?: number;
};

/**
 * Speech-to-text with Whisper on Groq. Returns segments with timestamps shifted
 * by `offset` (the chunk's position in the full recording).
 *
 * Whisper "hallucinates" text on silence or music ("Thanks for watching!").
 * We drop segments the model itself flags: high no-speech probability with
 * low confidence, or a very high compression ratio (a repetition loop).
 */
export async function transcribeChunk(
  audio: Blob,
  offset: number,
  language?: string,
): Promise<{ language: string; segments: Segment[] }> {
  const form = new FormData();
  form.append("file", audio, "chunk.wav");
  form.append("model", env.groqSttModel());
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  form.append("timestamp_granularities[]", "segment");
  if (language && /^[a-z]{2}$/.test(language)) form.append("language", language);

  let res: Response;
  try {
    res = await fetch(`${BASE}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}` },
      body: form,
    });
  } catch (e) {
    throw new ProviderError("groq", 0, (e as Error).message);
  }
  if (!res.ok) throw await providerError("groq", res);
  const data = (await res.json()) as { language?: string; segments?: WhisperSegment[]; text?: string };

  const segments: Segment[] = (data.segments ?? [])
    .filter((s) => {
      const silent = (s.no_speech_prob ?? 0) > 0.6 && (s.avg_logprob ?? 0) < -1;
      const looping = (s.compression_ratio ?? 0) > 2.6;
      return !silent && !looping && s.text.trim().length > 0;
    })
    .map((s) => ({ start: s.start + offset, end: s.end + offset, text: s.text.trim() }));

  return { language: data.language ?? "unknown", segments };
}

export type ChatOptions = {
  system: string;
  user: string;
  model: string;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
};

export async function groqChat(o: ChatOptions): Promise<string> {
  const body: Record<string, unknown> = {
    model: o.model,
    temperature: o.temperature ?? 0.2,
    max_completion_tokens: o.maxTokens ?? 8000,
    messages: [
      { role: "system", content: o.system },
      { role: "user", content: o.user },
    ],
  };
  if (o.json) body.response_format = { type: "json_object" };
  if (o.model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";

  let res: Response;
  try {
    res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new ProviderError("groq", 0, (e as Error).message);
  }
  if (!res.ok) throw await providerError("groq", res);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new ProviderError("groq", 502, "empty completion");
  return text;
}
