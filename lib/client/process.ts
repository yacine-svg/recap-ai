"use client";

import { extractAudioChunks } from "@/lib/audio/extract";
import type { Segment, Status } from "@/lib/types";

/* Browser-side orchestration: transcribe piece by piece, then drive the agents stage by stage. */

export type Progress = { phase: "extracting" | "transcribing" | "agents"; done: number; total: number; status?: Status };

async function call<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

/** Retries with growing pauses: free tiers answer "rate limited" for a few seconds at a time. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  const waits = [5000, 15000, 30000];
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = (e as Error).message;
      const retryable = /limit|429|rate|overloaded|timeout|temporar|50\d|network|fetch/i.test(msg);
      if (!retryable || i >= waits.length) throw e;
      await new Promise((r) => setTimeout(r, waits[i]));
    }
  }
}

type Piece = { language: string; segments: Segment[] };

async function saveTranscript(id: string, pieces: Piece[]) {
  const language = pieces.find((p) => p.language && p.language !== "unknown")?.language ?? "unknown";
  const segments = pieces.flatMap((p) => p.segments);
  await call(`/api/recaps/${id}/transcript`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language, segments }),
  });
}

export async function transcribeUpload(id: string, file: File, onProgress: (p: Progress) => void) {
  onProgress({ phase: "extracting", done: 0, total: 1 });
  const { chunks } = await extractAudioChunks(file);
  const pieces: Piece[] = new Array(chunks.length);
  let done = 0;
  onProgress({ phase: "transcribing", done, total: chunks.length });

  // two chunks in flight at a time: fast, but gentle with rate limits
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const i = next++;
      const c = chunks[i];
      pieces[i] = await withRetry(() => {
        const form = new FormData();
        form.append("file", c.blob, `chunk-${i}.wav`);
        form.append("offset", String(c.offset));
        return call<Piece>(`/api/recaps/${id}/transcribe`, { method: "POST", body: form });
      });
      onProgress({ phase: "transcribing", done: ++done, total: chunks.length });
    }
  };
  await Promise.all([worker(), worker()]);
  await saveTranscript(id, pieces);
}

export async function transcribeYoutube(id: string, duration: number, onProgress: (p: Progress) => void) {
  const CLIP = 600;
  const clips: { start: number; end: number }[] = [];
  for (let s = 0; s < duration; s += CLIP) clips.push({ start: s, end: Math.min(duration, s + CLIP) });
  const pieces: Piece[] = [];
  onProgress({ phase: "transcribing", done: 0, total: clips.length });
  for (const [i, clip] of clips.entries()) {
    pieces.push(
      await withRetry(() =>
        call<Piece>(`/api/recaps/${id}/transcribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(clip),
        }),
      ),
    );
    onProgress({ phase: "transcribing", done: i + 1, total: clips.length });
  }
  await saveTranscript(id, pieces);
}

const AGENT_STAGES: Status[] = ["embedding", "structuring", "analyzing", "writing", "verifying", "studying", "done"];

/** Calls /step until the recap is done. Safe to call again after a failure: it resumes. */
export async function runAgents(id: string, from: Status, onProgress: (p: Progress) => void) {
  let status = from;
  let guard = 0;
  while (status !== "done") {
    if (++guard > 20) throw new Error("The pipeline is not advancing; please retry.");
    onProgress({ phase: "agents", done: Math.max(0, AGENT_STAGES.indexOf(status)), total: AGENT_STAGES.length - 1, status });
    const res = await withRetry(() => call<{ status: Status }>(`/api/recaps/${id}/step`, { method: "POST" }));
    status = res.status;
  }
  onProgress({ phase: "agents", done: AGENT_STAGES.length - 1, total: AGENT_STAGES.length - 1, status: "done" });
}
