/* Small, dependency-free vector maths used by the pipeline. */

export function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export function norm(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

export function normalize(a: number[]): number[] {
  const n = norm(a);
  return n === 0 ? a.slice() : a.map((x) => x / n);
}

export function cosine(a: number[], b: number[]): number {
  const d = norm(a) * norm(b);
  return d === 0 ? 0 : dot(a, b) / d;
}

export function mean(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const out = new Array<number>(vectors[0].length).fill(0);
  for (const v of vectors) for (let i = 0; i < out.length; i++) out[i] += v[i];
  return out.map((x) => x / vectors.length);
}

/** Indices of the k vectors most similar to `query`, best first. */
export function topK(query: number[], vectors: number[][], k: number): { index: number; score: number }[] {
  return vectors
    .map((v, index) => ({ index, score: cosine(query, v) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * Maximal Marginal Relevance: pick k items that are relevant (high `relevance`)
 * but not redundant with each other. lambda=1 → pure relevance, 0 → pure diversity.
 */
export function mmr(vectors: number[][], relevance: number[], k: number, lambda = 0.65): number[] {
  const picked: number[] = [];
  const candidates = new Set(vectors.map((_, i) => i));
  while (picked.length < k && candidates.size > 0) {
    let best = -1;
    let bestScore = -Infinity;
    for (const i of candidates) {
      let redundancy = 0;
      for (const j of picked) redundancy = Math.max(redundancy, cosine(vectors[i], vectors[j]));
      const score = lambda * relevance[i] - (1 - lambda) * redundancy;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    picked.push(best);
    candidates.delete(best);
  }
  return picked;
}

/** pgvector returns "[0.1,0.2,...]" strings through PostgREST. */
export function parseVector(v: unknown): number[] {
  if (Array.isArray(v)) return v as number[];
  if (typeof v === "string") return JSON.parse(v) as number[];
  return [];
}

export function toPgVector(v: number[]): string {
  return `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : "0")).join(",")}]`;
}
