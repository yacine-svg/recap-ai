import { youtubeCaptions } from "@/lib/ai/captions";
import { transcribeChunk } from "@/lib/ai/groq";
import { transcribeYoutubeClip } from "@/lib/ai/youtube";
import { env } from "@/lib/env";
import { cleanSegments, youtubeId } from "@/lib/pipeline/text";
import type { Update } from "@/lib/pipeline/run";
import { LANGUAGES, MODE_LABELS, type Mode, type Recap, type Segment, type SourceType } from "@/lib/types";

/*
 * Request handling shared by the signed-in API (/api/recaps, Supabase) and the
 * guest API (/api/guest, recaps kept in the visitor's browser).
 */

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type NewRecap = {
  title: string;
  source_type: SourceType;
  source_url: string | null;
  duration_sec: number;
  mode: Mode;
  focus: string | null;
  output_language: string;
};

/** Validates the "New recap" form against the free-plan limits. */
export function parseNewRecap(body: Record<string, unknown>): NewRecap {
  const sourceType = body.source_type === "youtube" ? "youtube" : body.source_type === "upload" ? "upload" : null;
  if (!sourceType) throw new HttpError(400, "Choose a video file or a YouTube link.");

  const mode = (typeof body.mode === "string" && body.mode in MODE_LABELS ? body.mode : "overview") as Mode;
  const lang = typeof body.output_language === "string" && body.output_language in LANGUAGES ? body.output_language : "auto";
  const focus = typeof body.focus === "string" && body.focus.trim() ? body.focus.trim().slice(0, 300) : null;
  const duration = typeof body.duration_sec === "number" && body.duration_sec > 0 ? body.duration_sec : null;
  let title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 160) : "Untitled recap";

  const maxSec = env.maxMinutes() * 60;
  if (!duration) throw new HttpError(400, "Could not read the video's duration.");
  if (duration > maxSec + 30) throw new HttpError(400, `The free plan handles videos up to ${env.maxMinutes()} minutes.`);

  let sourceUrl: string | null = null;
  if (sourceType === "youtube") {
    const id = typeof body.source_url === "string" ? youtubeId(body.source_url) : null;
    if (!id) throw new HttpError(400, "That doesn't look like a YouTube link.");
    sourceUrl = `https://www.youtube.com/watch?v=${id}`;
    if (title === "Untitled recap") title = "YouTube video";
  }
  return { title, source_type: sourceType, source_url: sourceUrl, duration_sec: duration, mode, focus, output_language: lang };
}

const MAX_CHUNK_BYTES = 4.4 * 1024 * 1024;

type RecapSource = Pick<Recap, "source_type" | "source_url" | "duration_sec" | "status">;

/** Upload chunk: the multipart form of one ~110 s WAV piece. */
export async function transcribeUploadChunk(recap: RecapSource, form: FormData) {
  if (recap.status !== "transcribing") throw new HttpError(409, "This recap is already transcribed.");
  const file = form.get("file");
  const offset = parseFloat(String(form.get("offset") ?? "0")) || 0;
  const language = String(form.get("language") ?? "") || undefined;
  if (!(file instanceof Blob)) throw new HttpError(400, "Missing audio chunk.");
  if (file.size > MAX_CHUNK_BYTES) throw new HttpError(413, "Audio chunk too large.");
  return transcribeChunk(file, offset, language);
}

/** YouTube: the captions in one go, or one clip read by Gemini when there are none. */
export async function transcribeYoutubePiece(recap: RecapSource, body: { start?: number; end?: number; captions?: boolean }) {
  if (recap.status !== "transcribing") throw new HttpError(409, "This recap is already transcribed.");
  if (!recap.source_url) throw new HttpError(400, "This recap has no YouTube link.");
  if (body.captions) {
    try {
      const c = await youtubeCaptions(recap.source_url);
      return { language: c.language, segments: c.segments, complete: true, source: c.source };
    } catch (e) {
      // no captions: let the browser fall back to Gemini clips when a key is set
      if (env.geminiKey()) return { language: "unknown", segments: [], complete: false, reason: (e as Error).message };
      throw new HttpError(422, `Couldn't get this video's transcript: ${(e as Error).message}`);
    }
  }
  const start = Math.max(0, Number(body.start) || 0);
  const end = Math.min(recap.duration_sec ?? start + 600, Number(body.end) || start + 600);
  if (end <= start || end - start > 900) throw new HttpError(400, "Invalid clip range.");
  return transcribeYoutubeClip(recap.source_url, start, end);
}

/** Cleans the transcript assembled by the browser into the update that hands over to the agents. */
export function transcriptUpdate(recap: Recap, body: { language?: unknown; segments?: unknown; source?: unknown }): Update {
  if (recap.status !== "transcribing") throw new HttpError(409, "This recap is already transcribed.");
  const source = typeof body.source === "string" ? body.source.slice(0, 60) : null;
  const raw = Array.isArray(body.segments) ? (body.segments as Segment[]) : [];
  const limit = env.maxMinutes() * 60 + 60;
  const segments = cleanSegments(
    raw
      .filter((s) => s && typeof s.text === "string")
      .map((s) => ({ start: Number(s.start), end: Number(s.end), text: String(s.text).slice(0, 2000) })),
  ).filter((s) => s.start <= limit);

  if (!segments.length) throw new HttpError(422, "No speech was detected in this video.");
  const language = typeof body.language === "string" ? body.language.slice(0, 20) : "unknown";
  const lastEnd = segments[segments.length - 1].end;

  return {
    transcript: { language, segments },
    duration_sec: Math.max(recap.duration_sec ?? 0, lastEnd),
    status: "embedding",
    error: null,
    trace: [
      ...recap.trace,
      {
        agent: "Transcriber",
        stage: "transcribing",
        ms: Math.max(0, Date.now() - new Date(recap.created_at).getTime()),
        model: recap.source_type === "upload" ? env.groqSttModel() : (source ?? env.geminiLlmModel()),
        note: `Transcribed ${segments.length} segments (${language})${recap.source_type === "upload" ? " from audio extracted in your browser" : source ? " from the video's captions" : " by watching the YouTube video"}`,
        at: new Date().toISOString(),
      },
    ],
  };
}
