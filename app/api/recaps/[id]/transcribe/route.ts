import { NextResponse } from "next/server";
import { fail, loadRecap, requireUser, userMessage } from "@/lib/api";
import { transcribeChunk } from "@/lib/ai/groq";
import { transcribeYoutubeClip } from "@/lib/ai/youtube";

export const maxDuration = 120;

const MAX_CHUNK_BYTES = 4.4 * 1024 * 1024;

/**
 * Transcribes ONE piece of the recording and returns its segments:
 *  - uploads: a ~110 s WAV chunk cut in the browser → Whisper on Groq
 *  - YouTube: a 10 min clip → Gemini reads the video by URL
 * Stateless on purpose: the browser collects the pieces and saves the full transcript.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const recap = await loadRecap(auth.db, id, auth.user.id);
  if (!recap) return fail(404, "Recap not found.");
  if (recap.status !== "transcribing") return fail(409, "This recap is already transcribed.");

  try {
    if (recap.source_type === "upload") {
      const form = await req.formData();
      const file = form.get("file");
      const offset = parseFloat(String(form.get("offset") ?? "0")) || 0;
      const language = String(form.get("language") ?? "") || undefined;
      if (!(file instanceof Blob)) return fail(400, "Missing audio chunk.");
      if (file.size > MAX_CHUNK_BYTES) return fail(413, "Audio chunk too large.");
      return NextResponse.json(await transcribeChunk(file, offset, language));
    }
    const body = (await req.json()) as { start?: number; end?: number };
    const start = Math.max(0, Number(body.start) || 0);
    const end = Math.min(recap.duration_sec ?? start + 600, Number(body.end) || start + 600);
    if (end <= start || end - start > 900) return fail(400, "Invalid clip range.");
    return NextResponse.json(await transcribeYoutubeClip(recap.source_url!, start, end));
  } catch (e) {
    return fail(502, userMessage(e));
  }
}
