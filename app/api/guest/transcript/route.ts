import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { asGuestRecap, guestDisabled } from "@/lib/guest-server";
import { HttpError, transcriptUpdate } from "@/lib/recap-core";

/** Guest mode: turns the assembled transcript into the recap's next state. */
export async function POST(req: Request) {
  const off = guestDisabled();
  if (off) return off;
  const body = (await req.json().catch(() => ({}))) as { recap?: unknown; language?: unknown; segments?: unknown; source?: unknown };
  const recap = asGuestRecap(body.recap);
  if (!recap) return fail(400, "Missing recap.");
  try {
    return NextResponse.json({ recap: { ...recap, ...transcriptUpdate(recap, body), updated_at: new Date().toISOString() } });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message);
    throw e;
  }
}
