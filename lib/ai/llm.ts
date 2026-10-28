import { env } from "@/lib/env";
import { ProviderError, sleep } from "./errors";
import { geminiGenerate } from "./gemini";
import { groqChat } from "./groq";
import { parseJSON } from "./json";

/*
 * One entry point for every agent. Two tiers:
 *  - "long": big inputs (whole transcript). Gemini first: huge context window
 *    and a generous free tier; Groq as fallback.
 *  - "fast": small, many calls (fact checking, study tools). Groq first: very
 *    low latency; Gemini as fallback.
 * When a provider is rate-limited or down we wait once, then switch provider,
 * so one free-tier limit never breaks a recap.
 */

export type Tier = "long" | "fast";

type Provider = { name: string; run: (system: string, user: string, json: boolean, temperature: number) => Promise<string> };

function providers(tier: Tier): Provider[] {
  const gemini: Provider = {
    name: env.geminiLlmModel(),
    run: (system, user, json, temperature) => geminiGenerate({ system, parts: [{ text: user }], json, temperature }),
  };
  const groqModel = tier === "fast" ? env.groqFastModel() : env.groqLlmModel();
  const groq: Provider = {
    name: groqModel,
    run: (system, user, json, temperature) => groqChat({ system, user, json, temperature, model: groqModel }),
  };
  const list = tier === "long" ? [gemini, groq] : [groq, gemini];
  return list.filter((p) => (p === gemini ? env.geminiKey() : env.groqKey()));
}

export type LLMResult<T> = { data: T; model: string };

export async function askJSON<T>(tier: Tier, system: string, user: string, temperature = 0.2): Promise<LLMResult<T>> {
  const list = providers(tier);
  if (!list.length) throw new Error("No AI provider is configured (set GROQ_API_KEY and GEMINI_API_KEY).");
  let lastError: unknown;
  for (const p of list) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await p.run(system, user, true, temperature);
        return { data: parseJSON<T>(text), model: p.name };
      } catch (e) {
        lastError = e;
        const transient = e instanceof ProviderError ? e.transient : !(e instanceof ProviderError);
        if (!transient) break; // bad request / auth: no point retrying this provider
        const wait = e instanceof ProviderError && e.retryAfterSec ? Math.min(e.retryAfterSec, 8) * 1000 : 1500;
        if (attempt === 0) await sleep(wait);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
