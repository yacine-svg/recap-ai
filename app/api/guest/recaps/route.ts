import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { env } from "@/lib/env";
import { guestDisabled, overGuestLimit } from "@/lib/guest-server";
import { HttpError, parseNewRecap } from "@/lib/recap-core";
import type { Recap } from "@/lib/types";

/** Guest mode: validates the form and returns a new recap for the browser to keep. */
export async function POST(req: Request) {
  const off = guestDisabled();
  if (off) return off;
  try {
    const fields = parseNewRecap((await req.json().catch(() => ({}))) as Record<string, unknown>);
    if (overGuestLimit(req, env.dailyLimit())) return fail(429, `The free plan includes ${env.dailyLimit()} recaps per day. Come back tomorrow!`);
    const now = new Date().toISOString();
    const recap: Recap = {
      id: crypto.randomUUID(),
      user_id: "guest",
      ...fields,
      status: "transcribing",
      error: null,
      transcript: null,
      chapters: null,
      key_moments: null,
      concepts: null,
      summary: null,
      verification: null,
      flashcards: null,
      quiz: null,
      trace: [],
      is_public: false,
      created_at: now,
      updated_at: now,
    };
    return NextResponse.json({ recap });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message);
    throw e;
  }
}
