import { NextResponse } from "next/server";
import { fail, loadRecap, requireUser, userMessage } from "@/lib/api";
import { HttpError, transcribeUploadChunk, transcribeYoutubePiece } from "@/lib/recap-core";

export const maxDuration = 120;

/**
 * Transcribes ONE piece of the recording and returns its segments:
 *  - uploads: a ~110 s WAV chunk cut in the browser → Whisper on Groq
 *  - YouTube: first the video's captions (Supadata, then YouTube directly);
 *    if there are none and Gemini is configured, 10 min clips read by Gemini
 * Stateless on purpose: the browser collects the pieces and saves the full transcript.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const recap = await loadRecap(auth.db, id, auth.user.id);
  if (!recap) return fail(404, "Recap not found.");

  try {
    if (recap.source_type === "upload") return NextResponse.json(await transcribeUploadChunk(recap, await req.formData()));
    return NextResponse.json(await transcribeYoutubePiece(recap, await req.json()));
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message);
    return fail(502, userMessage(e));
  }
}
