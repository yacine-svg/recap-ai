import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/api";
import { env } from "@/lib/env";
import { youtubeId } from "@/lib/pipeline/text";
import { LANGUAGES, MODE_LABELS, type Mode } from "@/lib/types";

/** Creates a recap (after checking the free-plan limits). The browser then transcribes it. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sourceType = body.source_type === "youtube" ? "youtube" : body.source_type === "upload" ? "upload" : null;
  if (!sourceType) return fail(400, "Choose a video file or a YouTube link.");

  const mode = (typeof body.mode === "string" && body.mode in MODE_LABELS ? body.mode : "overview") as Mode;
  const lang = typeof body.output_language === "string" && body.output_language in LANGUAGES ? body.output_language : "auto";
  const focus = typeof body.focus === "string" && body.focus.trim() ? body.focus.trim().slice(0, 300) : null;
  const duration = typeof body.duration_sec === "number" && body.duration_sec > 0 ? body.duration_sec : null;
  let title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 160) : "Untitled recap";

  const maxSec = env.maxMinutes() * 60;
  if (!duration) return fail(400, "Could not read the video's duration.");
  if (duration > maxSec + 30) return fail(400, `The free plan handles videos up to ${env.maxMinutes()} minutes.`);

  let sourceUrl: string | null = null;
  if (sourceType === "youtube") {
    const id = typeof body.source_url === "string" ? youtubeId(body.source_url) : null;
    if (!id) return fail(400, "That doesn't look like a YouTube link.");
    sourceUrl = `https://www.youtube.com/watch?v=${id}`;
    if (title === "Untitled recap") title = "YouTube video";
  }

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count } = await db
    .from("recaps")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since.toISOString());
  if ((count ?? 0) >= env.dailyLimit()) return fail(429, `The free plan includes ${env.dailyLimit()} recaps per day. Come back tomorrow!`);

  const { data, error } = await db
    .from("recaps")
    .insert({
      user_id: user.id,
      title,
      source_type: sourceType,
      source_url: sourceUrl,
      duration_sec: duration,
      mode,
      focus,
      output_language: lang,
      status: "transcribing",
    })
    .select("id")
    .single();
  if (error) return fail(500, error.message);
  return NextResponse.json({ id: data.id });
}
