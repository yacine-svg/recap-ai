import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/api";
import { env } from "@/lib/env";
import { HttpError, parseNewRecap, type NewRecap } from "@/lib/recap-core";

/** Creates a recap (after checking the free-plan limits). The browser then transcribes it. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;

  let fields: NewRecap;
  try {
    fields = parseNewRecap((await req.json().catch(() => ({}))) as Record<string, unknown>);
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message);
    throw e;
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
    .insert({ user_id: user.id, ...fields, status: "transcribing" })
    .select("id")
    .single();
  if (error) return fail(500, error.message);
  return NextResponse.json({ id: data.id });
}
