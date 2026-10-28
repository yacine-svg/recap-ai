import { NextResponse } from "next/server";
import { fail, loadRecap, requireUser } from "@/lib/api";

/** Rename a recap or toggle its public share link. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const recap = await loadRecap(auth.db, id, auth.user.id);
  if (!recap) return fail(404, "Recap not found.");

  const body = (await req.json().catch(() => ({}))) as { is_public?: unknown; title?: unknown };
  const update: Record<string, unknown> = {};
  if (typeof body.is_public === "boolean") update.is_public = body.is_public;
  if (typeof body.title === "string" && body.title.trim()) update.title = body.title.trim().slice(0, 160);
  if (!Object.keys(update).length) return fail(400, "Nothing to update.");

  const { error } = await auth.db.from("recaps").update(update).eq("id", id);
  if (error) return fail(500, error.message);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const { error } = await auth.db.from("recaps").delete().eq("id", id).eq("user_id", auth.user.id);
  if (error) return fail(500, error.message);
  return NextResponse.json({ ok: true });
}
