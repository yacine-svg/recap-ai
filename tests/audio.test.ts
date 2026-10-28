import { describe, expect, test } from "bun:test";
import { encodeWav, findCuts, normalizePeak, planChunks } from "../lib/audio/wav";

const SR = 16000;

/** Speech-like noise with a silent pause every `pauseEvery` seconds. */
function fakeSpeech(seconds: number, pauseEvery: number, pauseLen = 0.6) {
  const s = new Float32Array(seconds * SR);
  let x = 1;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const inPause = t % pauseEvery < pauseLen;
    x = (x * 16807) % 2147483647;
    s[i] = inPause ? 0 : (x / 2147483647 - 0.5) * 0.6;
  }
  return s;
}

describe("audio chunking", () => {
  test("cuts land inside pauses, close to the target", () => {
    const s = fakeSpeech(600, 23); // pauses at 0, 23, 46, ... s
    const cuts = findCuts(s, SR, 110, 8);
    expect(cuts.length).toBeGreaterThanOrEqual(4);
    for (const c of cuts) {
      expect(c % 23).toBeLessThan(0.7); // inside a pause
    }
    for (let i = 1; i < cuts.length; i++) {
      expect(cuts[i] - cuts[i - 1]).toBeGreaterThan(100);
      expect(cuts[i] - cuts[i - 1]).toBeLessThan(120);
    }
  });

  test("chunks cover the whole recording and stay under the 4.5 MB body limit", () => {
    const s = fakeSpeech(1000, 17);
    const plan = planChunks(s, SR, 110);
    expect(plan[0].from).toBe(0);
    expect(plan[plan.length - 1].to).toBe(s.length);
    for (let i = 1; i < plan.length; i++) expect(plan[i].from).toBe(plan[i - 1].to);
    for (const p of plan) expect(44 + (p.to - p.from) * 2).toBeLessThan(4.2 * 1024 * 1024);
  });

  test("short audio is a single chunk", () => {
    expect(findCuts(fakeSpeech(60, 10), SR)).toEqual([]);
  });

  test("writes a valid WAV header", () => {
    const buf = encodeWav(new Float32Array([0, 0.5, -0.5, 1]), SR);
    const v = new DataView(buf);
    const tag = (o: number) => String.fromCharCode(...new Uint8Array(buf, o, 4));
    expect(tag(0)).toBe("RIFF");
    expect(tag(8)).toBe("WAVE");
    expect(v.getUint32(24, true)).toBe(SR);
    expect(v.getUint32(40, true)).toBe(8);
    expect(v.getInt16(44 + 2, true)).toBe(16383);
    expect(v.getInt16(44 + 6, true)).toBe(32767);
    expect(buf.byteLength).toBe(52);
  });

  test("boosts quiet recordings, leaves loud ones", () => {
    expect(normalizePeak(new Float32Array([0.1, -0.2]))[1]).toBeCloseTo(-0.9);
    const loud = new Float32Array([0.95]);
    expect(normalizePeak(loud)).toBe(loud);
  });
});
