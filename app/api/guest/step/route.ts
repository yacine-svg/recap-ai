import { NextResponse } from "next/server";
import { fail, userMessage } from "@/lib/api";
import { asGuestRecap, guestDisabled } from "@/lib/guest-server";
import { isRunnable, recomputedWindowStore, runStage } from "@/lib/pipeline/run";

export const maxDuration = 300;

/** Guest mode: runs the recap's next stage and returns the updated recap. */
export async function POST(req: Request) {
  const off = guestDisabled();
  if (off) return off;
  const body = (await req.json().catch(() => ({}))) as { recap?: unknown };
  const recap = asGuestRecap(body.recap);
  if (!recap) return fail(400, "Missing recap.");
  if (recap.status === "done") return NextResponse.json({ recap });
  if (!isRunnable(recap.status)) return fail(409, `Cannot continue from "${recap.status}".`);
  try {
    const update = await runStage(recomputedWindowStore, recap);
    return NextResponse.json({ recap: { ...recap, ...update, updated_at: new Date().toISOString() } });
  } catch (e) {
    return fail(502, userMessage(e));
  }
}
