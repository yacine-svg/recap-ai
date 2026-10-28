/* Server-side configuration. Never import this file from a client component. */

const read = (name: string, fallback = "") => process.env[name]?.trim() || fallback;

export const env = {
  groqKey: () => read("GROQ_API_KEY"),
  geminiKey: () => read("GEMINI_API_KEY"),
  groqSttModel: () => read("GROQ_STT_MODEL", "whisper-large-v3-turbo"),
  groqLlmModel: () => read("GROQ_LLM_MODEL", "openai/gpt-oss-120b"),
  groqFastModel: () => read("GROQ_FAST_MODEL", "openai/gpt-oss-20b"),
  geminiLlmModel: () => read("GEMINI_LLM_MODEL", "gemini-3.8-flash"),
  geminiEmbedModel: () => read("GEMINI_EMBED_MODEL", "gemini-embedding-001"),
  /** "local" (TF-IDF hashing, free, no API) or "gemini" (neural embeddings, needs a Gemini key with access). */
  embeddingsProvider: () => (read("EMBEDDINGS_PROVIDER", "local") === "gemini" ? "gemini" : "local") as "local" | "gemini",
  supadataKey: () => read("SUPADATA_API_KEY"),
  /** YouTube links: captions via Supadata, or Gemini watching the video. */
  youtubeEnabled: () => (!!read("SUPADATA_API_KEY") || !!read("GEMINI_API_KEY")) && read("YOUTUBE", "on") !== "off",
  dailyLimit: () => parseInt(read("RECAP_DAILY_LIMIT", "3"), 10) || 3,
  maxMinutes: () => parseInt(read("RECAP_MAX_MINUTES", "60"), 10) || 60,
};

export const EMBED_DIM = 768;
