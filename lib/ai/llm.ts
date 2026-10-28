import { env } from "@/lib/env";
import { ProviderError, sleep } from "./errors";
import { geminiGenerate } from "./gemini";
import { groqChat } from "./groq";
import { parseJSON } from "./json";

/*
 * One entry point for every agent, with a chain of models per tier:
 *  - "long" (bigger inputs: Scout, Analyst, Writer)
 *  - "fast" (many small calls: Verifier, Reviser, Tutor)
 * Groq's free plan limits tokens per minute PER MODEL, so the chain spreads
 * load across several Groq models; Gemini joins the chain when its key works.
 * Rate-limited → wait (if the wait is short) or move to the next model.
 * Unavailable (e.g. no free tier on this account) → skipped from then on.
 */

export type Tier = "long" | "fast";
type Provider = { name: string; kind: "groq" | "gemini"; run: (system: string, user: string, maxTokens: number, temperature: number) => Promise<string> };

let geminiBlocked = false; // remembered for the lifetime of this server instance

function chain(tier: Tier): Provider[] {
  const groq = (model: string): Provider => ({
    name: model,
    kind: "groq",
    run: (system, user, maxTokens, temperature) => groqChat({ system, user, json: true, temperature, maxTokens, model }),
  });
  const gemini: Provider = {
    name: env.geminiLlmModel(),
    kind: "gemini",
    run: (system, user, _maxTokens, temperature) => geminiGenerate({ system, parts: [{ text: user }], json: true, temperature }),
  };
  const groqModels =
    tier === "long"
      ? [env.groqLlmModel(), "llama-3.3-70b-versatile", env.groqFastModel()]
      : [env.groqFastModel(), "llama-3.1-8b-instant", env.groqLlmModel()];
  const list: Provider[] = [];
  if (env.geminiKey() && !geminiBlocked && tier === "long") list.push(gemini);
  if (env.groqKey()) list.push(...[...new Set(groqModels)].map(groq));
  if (env.geminiKey() && !geminiBlocked && tier === "fast") list.push(gemini);
  return list;
}

export type LLMResult<T> = { data: T; model: string };

export async function askJSON<T>(
  tier: Tier,
  system: string,
  user: string,
  temperature = 0.2,
  maxTokens = 2500,
): Promise<LLMResult<T>> {
  const list = chain(tier);
  if (!list.length) throw new Error("No AI provider is configured (set GROQ_API_KEY).");
  let lastError: unknown;
  for (const p of list) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await p.run(system, user, maxTokens, temperature);
        return { data: parseJSON<T>(text), model: p.name };
      } catch (e) {
        lastError = e;
        if (e instanceof ProviderError) {
          if (p.kind === "gemini" && (e.status === 403 || /free tier|billing|location/i.test(e.message))) {
            geminiBlocked = true;
            break;
          }
          if (e.status === 429) {
            const wait = e.retryAfterSec ?? 10;
            if (attempt === 0 && wait <= 20) {
              await sleep(wait * 1000 + 300);
              continue;
            }
            break; // long wait: try the next model instead
          }
          if (!e.transient) break; // bad request for this model: next one
          if (attempt === 0) await sleep(1500);
        } else if (attempt === 0) {
          continue; // invalid JSON: ask the same model once more
        }
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
