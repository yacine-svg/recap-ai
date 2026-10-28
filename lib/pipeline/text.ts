import type { Segment, TranscriptWindow } from "@/lib/types";

/** 75 → "1:15", 3725 → "1:02:05" */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(r).padStart(2, "0")}`;
}

/** "1:15" | "01:02:05" | "75" | 75 → seconds (NaN when unreadable) */
export function parseTime(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return NaN;
  const t = v.trim().replace(/s$/, "");
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  const parts = t.split(":").map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return NaN;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export function youtubeId(url: string): string | null {
  const m = url
    .trim()
    .match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/**
 * Cleans raw speech-to-text output: drops empty segments, merges the
 * repeated lines Whisper sometimes loops on, and keeps times monotonic.
 */
export function cleanSegments(raw: Segment[]): Segment[] {
  const sorted = raw
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.text && s.text.trim())
    .map((s) => ({ start: Math.max(0, s.start), end: Math.max(s.start, s.end), text: s.text.replace(/\s+/g, " ").trim() }))
    .sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  for (const s of sorted) {
    const prev = out[out.length - 1];
    if (prev && prev.text.toLowerCase() === s.text.toLowerCase()) {
      prev.end = Math.max(prev.end, s.end); // repetition loop: keep one copy
      continue;
    }
    if (prev && s.start < prev.end) s.start = prev.end;
    if (s.end < s.start) s.end = s.start;
    out.push(s);
  }
  return out;
}

const SENTENCE_END = /[.!?…。؟]["')\]]?$/;

/**
 * Groups segments into windows of roughly `target` seconds, preferring to cut
 * at the end of a sentence, never longer than `max` seconds.
 */
export function buildWindows(segments: Segment[], target = 40, max = 65): TranscriptWindow[] {
  const windows: TranscriptWindow[] = [];
  let cur: Segment[] = [];
  const flush = () => {
    if (!cur.length) return;
    windows.push({
      idx: windows.length,
      start: cur[0].start,
      end: cur[cur.length - 1].end,
      text: cur.map((s) => s.text).join(" "),
    });
    cur = [];
  };
  for (const s of segments) {
    if (cur.length && s.end - cur[0].start > max) flush();
    cur.push(s);
    const len = s.end - cur[0].start;
    if (len >= target && SENTENCE_END.test(s.text)) flush();
  }
  flush();
  return windows;
}

/** Rough token estimate (≈ 4 characters per token for Latin text). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Keeps the text under `maxChars` by sampling evenly instead of cutting the end. */
export function squeeze(parts: string[], maxChars: number): string[] {
  const total = parts.reduce((n, p) => n + p.length, 0);
  if (total <= maxChars) return parts;
  const ratio = maxChars / total;
  return parts.map((p) => {
    const keep = Math.max(80, Math.floor(p.length * ratio));
    if (p.length <= keep) return p;
    const half = Math.floor(keep / 2);
    return `${p.slice(0, half)} … ${p.slice(p.length - half)}`;
  });
}
