import { describe, expect, test } from "bun:test";
import { detectChapters, depthScores, pickKeyMoments } from "../lib/pipeline/segment";
import { buildWindows, cleanSegments, formatTime, parseTime, squeeze, youtubeId } from "../lib/pipeline/text";
import { cosine, mmr, normalize, parseVector, toPgVector, topK } from "../lib/pipeline/vector";

/** Random unit vector near `base`, to simulate embeddings of one topic. */
function around(base: number[], noise: number, seed: { v: number }) {
  const rnd = () => {
    seed.v = (seed.v * 16807) % 2147483647;
    return seed.v / 2147483647 - 0.5;
  };
  return normalize(base.map((x) => x + rnd() * noise));
}
const axis = (i: number, d = 16) => Array.from({ length: d }, (_, j) => (j === i ? 1 : 0));

describe("text", () => {
  test("formats and parses timestamps", () => {
    expect(formatTime(75)).toBe("1:15");
    expect(formatTime(3725)).toBe("1:02:05");
    expect(parseTime("1:15")).toBe(75);
    expect(parseTime("01:02:05")).toBe(3725);
    expect(parseTime("42s")).toBe(42);
    expect(parseTime(12.5)).toBe(12.5);
    expect(Number.isNaN(parseTime("abc"))).toBe(true);
  });

  test("extracts YouTube ids", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://example.com")).toBeNull();
  });

  test("cleans Whisper repetition loops and overlaps", () => {
    const out = cleanSegments([
      { start: 0, end: 2, text: " Hello  there. " },
      { start: 2, end: 4, text: "hello there." },
      { start: 3.5, end: 6, text: "Next idea." },
      { start: 7, end: 8, text: "   " },
    ]);
    expect(out).toEqual([
      { start: 0, end: 4, text: "Hello there." },
      { start: 4, end: 6, text: "Next idea." },
    ]);
  });

  test("builds windows near the target length, cut at sentence ends", () => {
    const segs = Array.from({ length: 30 }, (_, i) => ({ start: i * 10, end: i * 10 + 10, text: i % 2 ? "end of sentence." : "middle part" }));
    const w = buildWindows(segs, 40, 65);
    expect(w.length).toBeGreaterThan(5);
    for (const x of w) expect(x.end - x.start).toBeLessThanOrEqual(70);
    expect(w[0].idx).toBe(0);
    expect(w.map((x) => x.text).join(" ").split("end of sentence.").length - 1).toBe(15);
  });

  test("squeeze keeps every part and respects the budget", () => {
    const parts = ["a".repeat(1000), "b".repeat(3000)];
    const out = squeeze(parts, 1000);
    expect(out.length).toBe(2);
    expect(out.join("").length).toBeLessThan(1100);
    expect(out[1].startsWith("b")).toBe(true);
  });
});

describe("vectors", () => {
  test("cosine, topK, pgvector round trip", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(topK([1, 0], [[0, 1], [1, 0.1], [0.5, 0.5]], 2).map((h) => h.index)).toEqual([1, 2]);
    expect(parseVector(toPgVector([0.5, -0.25]))).toEqual([0.5, -0.25]);
  });

  test("MMR prefers diverse items over near-duplicates", () => {
    const v = [normalize([1, 0]), normalize([0.99, 0.05]), normalize([0, 1])];
    const picked = mmr(v, [1, 0.99, 0.6], 2, 0.5);
    expect(picked).toEqual([0, 2]);
  });
});

describe("chapter segmentation", () => {
  test("finds the topic shifts of a 3-topic talk", () => {
    const seed = { v: 42 };
    const topics = [axis(0), axis(5), axis(10)];
    const emb: number[][] = [];
    for (let t = 0; t < 3; t++) for (let i = 0; i < 10; i++) emb.push(around(topics[t], 0.6, seed));
    const starts = emb.map((_, i) => i * 40);
    const ch = detectChapters(emb, { starts, duration: 1200, maxChapters: 6, minChapterSec: 120 });
    const cutAt = ch.slice(1).map((c) => c.from);
    expect(cutAt).toContain(10);
    expect(cutAt).toContain(20);
    expect(ch[0].from).toBe(0);
    expect(ch[ch.length - 1].to).toBe(29);
  });

  test("short videos stay one chapter", () => {
    const emb = [axis(0), axis(1), axis(2)];
    expect(detectChapters(emb, { starts: [0, 40, 80], duration: 120 })).toEqual([{ from: 0, to: 2 }]);
  });

  test("depth is zero on a flat curve", () => {
    expect(depthScores([0.8, 0.8, 0.8]).every((d) => d === 0)).toBe(true);
  });

  test("key moments spread over chapters and follow the focus", () => {
    const seed = { v: 7 };
    const emb: number[][] = [];
    for (let t = 0; t < 4; t++) for (let i = 0; i < 6; i++) emb.push(around(axis(t * 3), 0.5, seed));
    const chapters = [0, 1, 2, 3].map((t) => ({ from: t * 6, to: t * 6 + 5 }));
    const plain = pickKeyMoments(emb, chapters, 4);
    const chaptersHit = new Set(plain.map((p) => Math.floor(p.windowId / 6)));
    expect(chaptersHit.size).toBeGreaterThanOrEqual(3);
    const focused = pickKeyMoments(emb, chapters, 2, axis(6));
    expect(focused.some((p) => Math.floor(p.windowId / 6) === 2)).toBe(true);
  });
});
