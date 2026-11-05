import { NextResponse } from "next/server";
import { fail, loadRecap, requireUser } from "@/lib/api";
import { HttpError, transcriptUpdate } from "@/lib/recap-core";
import type { Update } from "@/lib/pipeline/run";

/** Saves the full transcript assembled by the browser and hands over to the agents. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const recap = await loadRecap(auth.db, id, auth.user.id);
  if (!recap) return fail(404, "Recap not found.");

  let update: Update;
  try {
    update = transcriptUpdate(recap, await req.json().catch(() => ({})));
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    if (e.status === 422) await auth.db.from("recaps").update({ status: "error", error: e.message }).eq("id", id);
    return fail(e.status, e.message);
  }

  const { error } = await auth.db.from("recaps").update(update).eq("id", id).eq("status", "transcribing");
  if (error) return fail(500, error.message);
  return NextResponse.json({ status: "embedding" });
}
