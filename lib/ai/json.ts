/** Parses JSON from a model answer, tolerating ```json fences or text around it. */
export function parseJSON<T = unknown>(text: string): T {
  const t = text.trim();
  try {
    return JSON.parse(t) as T;
  } catch {
    /* fall through */
  }
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]) as T;
    } catch {
      /* fall through */
    }
  }
  const first = Math.min(...["{", "["].map((c) => t.indexOf(c)).filter((i) => i >= 0));
  const last = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (Number.isFinite(first) && last > first) return JSON.parse(t.slice(first, last + 1)) as T;
  throw new Error("The model did not return valid JSON");
}

export const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v.trim() : fallback);
export const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
