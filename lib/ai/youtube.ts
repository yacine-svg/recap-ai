import type { Segment } from "@/lib/types";
import { parseTime } from "@/lib/pipeline/text";
import { geminiGenerate } from "./gemini";
import { arr, obj, parseJSON, str } from "./json";

/**
 * Transcribes one clip of a public YouTube video with Gemini, which can read
 * YouTube URLs directly. We process long videos clip by clip (10 min each) so
 * every request stays small and fast.
 */
export async function transcribeYoutubeClip(
  url: string,
  start: number,
  end: number,
): Promise<{ language: string; segments: Segment[] }> {
  const text = await geminiGenerate({
    system:
      "You are a precise speech-to-text engine. Transcribe exactly what is said, in the original language, without translating, summarising or describing visuals. Return JSON only.",
    parts: [
      {
        fileData: { fileUri: url },
        videoMetadata: { startOffset: `${Math.floor(start)}s`, endOffset: `${Math.ceil(end)}s` },
      },
      {
        text: `Transcribe the speech of this clip (from ${Math.floor(start)}s to ${Math.ceil(end)}s of the full video).
Return {"language": "<ISO 639-1 code>", "segments": [{"start": <seconds from the beginning of the FULL video>, "end": <seconds>, "text": "<what is said>"}]}.
Use segments of 5 to 20 seconds that end at natural pauses. If nobody speaks, return an empty "segments" array.`,
      },
    ],
    json: true,
    temperature: 0,
    lowMediaResolution: true,
  });

  const data = obj(parseJSON(text));
  let segments: Segment[] = arr(data.segments)
    .map((s) => {
      const o = obj(s);
      return { start: parseTime(o.start), end: parseTime(o.end), text: str(o.text) };
    })
    .filter((s) => Number.isFinite(s.start) && s.text);

  // Some models answer with times relative to the clip: shift them if so.
  if (start > 0 && segments.length) {
    const maxStart = Math.max(...segments.map((s) => s.start));
    const minStart = Math.min(...segments.map((s) => s.start));
    if (minStart < start - 5 && maxStart <= end - start + 30) {
      segments = segments.map((s) => ({ ...s, start: s.start + start, end: s.end + start }));
    }
  }
  segments = segments
    .map((s) => ({ ...s, end: Number.isFinite(s.end) && s.end > s.start ? s.end : s.start + 5 }))
    .filter((s) => s.start >= start - 2 && s.start <= end + 2);

  return { language: str(data.language, "unknown"), segments };
}
