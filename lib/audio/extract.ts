"use client";

import { SAMPLE_RATE, encodeWav, normalizePeak, planChunks } from "./wav";

export type AudioChunk = { blob: Blob; offset: number; duration: number };

/**
 * Turns a video or audio file into small speech-ready WAV chunks, entirely in
 * the browser: the file is never uploaded, only ~3.5 MB pieces of 16 kHz mono
 * audio go to the transcription API (under the 4.5 MB serverless body limit).
 */
export async function extractAudioChunks(file: File): Promise<{ duration: number; chunks: AudioChunk[] }> {
  const data = await file.arrayBuffer();
  // An OfflineAudioContext at 16 kHz makes the browser decode AND resample in one go.
  const ctx = new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE);
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(data);
  } catch {
    throw new Error("Your browser could not read the audio of this file. Try an MP4, WebM, MP3, M4A or WAV file.");
  }

  // mix down to mono
  const mono = new Float32Array(decoded.length);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const ch = decoded.getChannelData(c);
    for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / decoded.numberOfChannels;
  }
  const samples = normalizePeak(mono);

  const chunks = planChunks(samples, SAMPLE_RATE).map((p) => ({
    offset: p.offset,
    duration: (p.to - p.from) / SAMPLE_RATE,
    blob: new Blob([encodeWav(samples.subarray(p.from, p.to), SAMPLE_RATE)], { type: "audio/wav" }),
  }));
  return { duration: samples.length / SAMPLE_RATE, chunks };
}

/** Reads a media file's duration from its metadata, without decoding it. */
export function mediaDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(file.type.startsWith("audio") ? "audio" : "video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(el.duration) ? el.duration : 0);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    el.src = url;
  });
}
