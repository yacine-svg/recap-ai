import { NextResponse } from "next/server";
import { fail, loadRecap, requireUser } from "@/lib/api";
import { env } from "@/lib/env";
import { cleanSegments } from "@/lib/pipeline/text";
import type { Segment } from "@/lib/types";

/** Saves the full transcript assembled by the browser and hands over to the agents. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const recap = await loadRecap(auth.db, id, auth.user.id);
  if (!recap) return fail(404, "Recap not found.");
  if (recap.status !== "transcribing") return fail(409, "This recap is already transcribed.");

  const body = (await req.json().catch(() => ({}))) as { language?: unknown; segments?: unknown; source?: unknown };
  const source = typeof body.source === "string" ? body.source.slice(0, 60) : null;
  const raw = Array.isArray(body.segments) ? (body.segments as Segment[]) : [];
  const limit = env.maxMinutes() * 60 + 60;
  const segments = cleanSegments(
    raw
      .filter((s) => s && typeof s.text === "string")
      .map((s) => ({ start: Number(s.start), end: Number(s.end), text: String(s.text).slice(0, 2000) })),
  ).filter((s) => s.start <= limit);

  if (!segments.length) {
    await auth.db.from("recaps").update({ status: "error", error: "No speech was detected in this video." }).eq("id", id);
    return fail(422, "No speech was detected in this video.");
  }
  const language = typeof body.language === "string" ? body.language.slice(0, 20) : "unknown";
  const lastEnd = segments[segments.length - 1].end;

  const { error } = await auth.db
    .from("recaps")
    .update({
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
    })
    .eq("id", id)
    .eq("status", "transcribing");
  if (error) return fail(500, error.message);
  return NextResponse.json({ status: "embedding" });
}
