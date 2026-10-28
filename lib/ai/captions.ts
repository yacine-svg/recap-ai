import type { Segment } from "@/lib/types";
import { youtubeId } from "@/lib/pipeline/text";
import { sleep } from "./errors";

/*
 * YouTube transcripts from the video's captions (uploaded or auto-generated).
 *  1. Supadata API (free plan, 1 credit per video in "native" mode)
 *  2. Backup: YouTube's own caption track, read directly (often blocked
 *     from cloud servers, so it is only a fallback)
 */

type Captions = { language: string; segments: Segment[]; source: string };

const clean = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

/** Drops "[Music]", "[Applause]"… and empty lines. */
const keep = (s: Segment) => s.text && !/^[[(♪].*[\])♪]$/.test(s.text);

async function supadata(url: string, key: string): Promise<Captions> {
  const q = new URLSearchParams({ url, mode: "native", text: "false", chunkSize: "400" });
  const headers = { "x-api-key": key };
  let res = await fetch(`https://api.supadata.ai/v1/transcript?${q}`, { headers });
  let body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (res.status === 202 && typeof body.jobId === "string") {
    // long video: processed as a job, poll it
    const deadline = Date.now() + 90_000;
    for (;;) {
      if (Date.now() > deadline) throw new Error("Supadata: the captions job took too long");
      await sleep(1500);
      res = await fetch(`https://api.supadata.ai/v1/transcript/${body.jobId}`, { headers });
      const job = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (job.status === "completed") {
        body = job;
        break;
      }
      if (job.status === "failed") throw new Error(`Supadata: ${JSON.stringify(job.error ?? "job failed").slice(0, 200)}`);
    }
  } else if (res.status === 206) {
    throw new Error("This video has no captions, so its transcript can't be read.");
  } else if (!res.ok) {
    const msg = typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : res.statusText;
    throw new Error(`Supadata ${res.status}: ${msg}`);
  }

  const content = Array.isArray(body.content) ? (body.content as { text?: string; offset?: number; duration?: number }[]) : [];
  const segments = content
    .map((c) => {
      const start = (c.offset ?? 0) / 1000;
      return { start, end: start + (c.duration ?? 0) / 1000, text: clean(c.text ?? "") };
    })
    .filter(keep);
  return { language: typeof body.lang === "string" ? body.lang : "unknown", segments, source: "Supadata (YouTube captions)" };
}

/** Reads the caption track straight from YouTube's watch page (backup). */
async function direct(url: string): Promise<Captions> {
  const id = youtubeId(url);
  if (!id) throw new Error("Invalid YouTube link.");
  const page = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, {
    headers: { "Accept-Language": "en-US,en;q=0.9", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36" },
  }).then((r) => r.text());
  const m = page.match(/"captionTracks":(\[.*?\])/);
  if (!m) throw new Error("YouTube did not return captions for this video (none available, or the request was blocked).");
  const tracks = JSON.parse(m[1]) as { baseUrl: string; languageCode: string; kind?: string }[];
  // prefer human captions over auto-generated ("asr") ones
  const track = tracks.find((t) => t.kind !== "asr") ?? tracks[0];
  const data = (await fetch(`${track.baseUrl.replace(/\\u0026/g, "&")}&fmt=json3`).then((r) => r.json())) as {
    events?: { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] }[];
  };
  const segments = (data.events ?? [])
    .filter((e) => e.segs?.length)
    .map((e) => {
      const start = (e.tStartMs ?? 0) / 1000;
      return { start, end: start + (e.dDurationMs ?? 0) / 1000, text: clean((e.segs ?? []).map((s) => s.utf8 ?? "").join("")) };
    })
    .filter(keep);
  return { language: track.languageCode, segments, source: "YouTube captions" };
}

/** Merges short caption lines into ~10 s segments so windows read like sentences. */
function merge(segments: Segment[], target = 10): Segment[] {
  const out: Segment[] = [];
  for (const s of segments) {
    const last = out[out.length - 1];
    if (last && s.start - last.start < target) {
      last.text = `${last.text} ${s.text}`;
      last.end = Math.max(last.end, s.end);
    } else out.push({ ...s });
  }
  return out;
}

export async function youtubeCaptions(url: string): Promise<Captions> {
  const key = process.env.SUPADATA_API_KEY?.trim();
  const errors: string[] = [];
  if (key) {
    try {
      const r = await supadata(url, key);
      if (r.segments.length) return { ...r, segments: merge(r.segments) };
      errors.push("Supadata returned no captions");
    } catch (e) {
      errors.push((e as Error).message);
      if (/no captions/.test((e as Error).message)) throw e;
    }
  }
  try {
    const r = await direct(url);
    if (r.segments.length) return { ...r, segments: merge(r.segments) };
    errors.push("YouTube returned empty captions");
  } catch (e) {
    errors.push((e as Error).message);
  }
  throw new Error(errors.join(" · "));
}
