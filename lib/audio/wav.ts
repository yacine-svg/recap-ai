/* Pure audio helpers (no browser APIs), unit-tested in tests/audio.test.ts. */

export const SAMPLE_RATE = 16000; // what Whisper works at internally

/** RMS energy of consecutive frames of `frameSec` seconds. */
export function frameEnergies(samples: Float32Array, sampleRate: number, frameSec = 0.1): Float32Array {
  const size = Math.max(1, Math.round(sampleRate * frameSec));
  const n = Math.ceil(samples.length / size);
  const out = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let sum = 0;
    const from = f * size;
    const to = Math.min(samples.length, from + size);
    for (let i = from; i < to; i++) sum += samples[i] * samples[i];
    out[f] = Math.sqrt(sum / Math.max(1, to - from));
  }
  return out;
}

/**
 * Where to cut the recording into chunks of about `targetSec` seconds.
 * Around each target we look `searchSec` seconds back and forth for the
 * quietest 100 ms frame, so cuts land in pauses instead of mid-word.
 * Returns cut positions in seconds (excluding 0 and the end).
 */
export function findCuts(samples: Float32Array, sampleRate: number, targetSec = 110, searchSec = 8): number[] {
  const frameSec = 0.1;
  const energy = frameEnergies(samples, sampleRate, frameSec);
  const total = samples.length / sampleRate;
  const cuts: number[] = [];
  let last = 0;
  while (total - last > targetSec + searchSec) {
    const target = last + targetSec;
    const from = Math.max(Math.ceil((last + 30) / frameSec), Math.floor((target - searchSec) / frameSec));
    const to = Math.min(energy.length - 1, Math.floor((target + searchSec) / frameSec));
    let best = Math.round(target / frameSec);
    let bestE = Infinity;
    for (let f = from; f <= to; f++) {
      if (energy[f] < bestE) {
        bestE = energy[f];
        best = f;
      }
    }
    const cut = (best + 0.5) * frameSec;
    cuts.push(cut);
    last = cut;
  }
  return cuts;
}

/** 16-bit PCM mono WAV. 16 kHz → 32 kB per second, so 110 s ≈ 3.5 MB. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

/** Peak-normalises quiet recordings (classroom mics) so Whisper hears them well. */
export function normalizePeak(samples: Float32Array, target = 0.9): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak === 0 || peak >= target) return samples;
  const g = Math.min(8, target / peak);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * g;
  return out;
}

export type ChunkPlan = { offset: number; from: number; to: number }; // seconds, sample indices

export function planChunks(samples: Float32Array, sampleRate: number, targetSec = 110): ChunkPlan[] {
  const cuts = findCuts(samples, sampleRate, targetSec);
  const bounds = [0, ...cuts, samples.length / sampleRate];
  const plan: ChunkPlan[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    plan.push({
      offset: bounds[i],
      from: Math.round(bounds[i] * sampleRate),
      to: Math.min(samples.length, Math.round(bounds[i + 1] * sampleRate)),
    });
  }
  return plan;
}
