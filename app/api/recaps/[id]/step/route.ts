import { NextResponse } from "next/server";
import { fail, loadRecap, requireUser, userMessage } from "@/lib/api";
import { isRunnable, runStage } from "@/lib/pipeline/run";

export const maxDuration = 300;

/** Runs the recap's next pipeline stage. The browser calls this until status is "done". */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const recap = await loadRecap(auth.db, id, auth.user.id);
  if (!recap) return fail(404, "Recap not found.");
  if (recap.status === "done") return NextResponse.json({ status: "done" });
  if (!isRunnable(recap.status)) return fail(409, `Cannot continue from "${recap.status}".`);

  try {
    const update = await runStage(auth.db, recap);
    // .eq(status) = optimistic lock: if another tab already ran this stage, we don't overwrite it
    const { data, error } = await auth.db
      .from("recaps")
      .update(update)
      .eq("id", id)
      .eq("status", recap.status)
      .select("status")
      .maybeSingle();
    if (error) return fail(500, error.message);
    return NextResponse.json({ status: data?.status ?? update.status });
  } catch (e) {
    const message = userMessage(e);
    // keep the status so the same stage can be retried
    await auth.db.from("recaps").update({ error: message }).eq("id", id);
    return fail(502, message);
  }
}
