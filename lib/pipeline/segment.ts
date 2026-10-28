import { cosine, mean, mmr } from "./vector";

/*
 * Chapter detection: TextTiling (Hearst, 1997) on sentence embeddings instead of
 * word counts. We measure how similar the speech is just before and just after
 * every gap between windows; a deep "valley" in that similarity curve means the
 * speaker changed topic, so we cut a chapter there.
 */

export type ChapterRange = { from: number; to: number }; // inclusive window indices

/** Similarity across each gap (gap i sits between window i and i+1). */
export function gapSimilarities(emb: number[][], block = 2): number[] {
  const sims: number[] = [];
  for (let i = 0; i < emb.length - 1; i++) {
    const left = mean(emb.slice(Math.max(0, i - block + 1), i + 1));
    const right = mean(emb.slice(i + 1, Math.min(emb.length, i + 1 + block)));
    sims.push(cosine(left, right));
  }
  return sims;
}

export function smooth(xs: number[], width = 3): number[] {
  const half = Math.floor(width / 2);
  return xs.map((_, i) => {
    const slice = xs.slice(Math.max(0, i - half), Math.min(xs.length, i + half + 1));
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

/** Depth of the valley at each gap: how far the curve climbs back up on both sides. */
export function depthScores(sims: number[]): number[] {
  return sims.map((s, i) => {
    let l = s;
    for (let j = i - 1; j >= 0 && sims[j] >= l; j--) l = sims[j];
    let r = s;
    for (let j = i + 1; j < sims.length && sims[j] >= r; j++) r = sims[j];
    return l - s + (r - s);
  });
}

export type SegmentOptions = {
  starts: number[]; // start time of each window (s)
  duration: number; // total duration (s)
  minChapterSec?: number;
  maxChapters?: number;
};

export function detectChapters(emb: number[][], opts: SegmentOptions): ChapterRange[] {
  const n = emb.length;
  if (n === 0) return [];
  const duration = Math.max(1, opts.duration);
  const maxChapters = opts.maxChapters ?? Math.min(12, Math.max(1, Math.round(duration / 300)));
  const minLen = opts.minChapterSec ?? Math.max(90, duration / 24);
  if (n < 4 || maxChapters <= 1) return [{ from: 0, to: n - 1 }];

  const sims = smooth(gapSimilarities(emb));
  const depth = depthScores(sims);
  const avg = depth.reduce((a, b) => a + b, 0) / depth.length;
  const sd = Math.sqrt(depth.reduce((a, b) => a + (b - avg) ** 2, 0) / depth.length);
  const threshold = avg - sd / 2;

  // candidate gaps = local minima of the similarity curve that are deep enough
  const candidates = depth
    .map((d, i) => ({ gap: i, d }))
    .filter(({ gap, d }) => {
      const isMin = (gap === 0 || sims[gap] <= sims[gap - 1]) && (gap === sims.length - 1 || sims[gap] <= sims[gap + 1]);
      return isMin && d > threshold && d > 0;
    })
    .sort((a, b) => b.d - a.d);

  // greedily keep the deepest cuts that leave every chapter long enough
  const cutStarts: number[] = []; // window index where a new chapter starts
  const end = Math.max(duration, opts.starts[n - 1]);
  const okWith = (cuts: number[]) => {
    const s = [0, ...cuts].sort((a, b) => a - b).map((w) => opts.starts[w]);
    s.push(end);
    for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] < minLen) return false;
    return true;
  };
  for (const c of candidates) {
    if (cutStarts.length >= maxChapters - 1) break;
    const next = [...cutStarts, c.gap + 1];
    if (okWith(next)) cutStarts.push(c.gap + 1);
  }
  cutStarts.sort((a, b) => a - b);

  const ranges: ChapterRange[] = [];
  let from = 0;
  for (const c of cutStarts) {
    ranges.push({ from, to: c - 1 });
    from = c;
  }
  ranges.push({ from, to: n - 1 });
  return ranges;
}

/**
 * Key moments: windows that best represent the talk (close to the overall
 * meaning, or to the user's focus question) while being diverse (MMR), with at
 * most `perChapter` moments from the same chapter so they spread over the video.
 */
export function pickKeyMoments(
  emb: number[][],
  chapters: ChapterRange[],
  k: number,
  focus?: number[],
  perChapter = 2,
): { windowId: number; score: number }[] {
  if (emb.length === 0) return [];
  const centroid = mean(emb);
  const chapterOf = new Array<number>(emb.length).fill(0);
  chapters.forEach((c, ci) => {
    for (let i = c.from; i <= c.to; i++) chapterOf[i] = ci;
  });
  const chapterCentroids = chapters.map((c) => mean(emb.slice(c.from, c.to + 1)));
  const relevance = emb.map((v, i) => {
    const global = cosine(v, centroid);
    const local = cosine(v, chapterCentroids[chapterOf[i]] ?? centroid);
    const base = 0.5 * global + 0.5 * local;
    return focus && focus.length ? 0.4 * base + 0.6 * cosine(v, focus) : base;
  });

  const order = mmr(emb, relevance, Math.min(emb.length, k * 3));
  const used = new Map<number, number>();
  const out: { windowId: number; score: number }[] = [];
  for (const i of order) {
    const ch = chapterOf[i];
    if ((used.get(ch) ?? 0) >= perChapter) continue;
    used.set(ch, (used.get(ch) ?? 0) + 1);
    out.push({ windowId: i, score: relevance[i] });
    if (out.length >= k) break;
  }
  return out.sort((a, b) => a.windowId - b.windowId);
}
