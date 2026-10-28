import Link from "next/link";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { formatTime } from "@/lib/pipeline/text";
import { createClient } from "@/lib/supabase/server";
import { MODE_LABELS, type Recap } from "@/lib/types";

export const metadata = { title: "My recaps" };

export default async function Dashboard() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login?next=/app");

  const { data } = await db
    .from("recaps")
    .select("id,title,status,error,mode,duration_sec,source_type,created_at,verification")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const recaps = (data ?? []) as Pick<Recap, "id" | "title" | "status" | "error" | "mode" | "duration_sec" | "source_type" | "created_at" | "verification">[];

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const today = recaps.filter((r) => new Date(r.created_at) >= since).length;

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ margin: 0 }}>My recaps</h1>
        <span className="muted small" style={{ marginLeft: "auto" }}>
          {today} / {env.dailyLimit()} used today · up to {env.maxMinutes()} min per video
        </span>
        <Link className="btn primary" href="/app/new">
          New recap
        </Link>
      </div>
      {recaps.length === 0 ? (
        <div className="panel">
          <p>No recaps yet. Upload a lecture or paste a YouTube link to get started.</p>
        </div>
      ) : (
        <ul className="list panel">
          {recaps.map((r) => (
            <li key={r.id} className="row">
              <Link href={`/app/r/${r.id}`} style={{ fontWeight: 600 }}>
                {r.title}
              </Link>
              <span className="muted small">
                {MODE_LABELS[r.mode]?.label} · {r.duration_sec ? formatTime(r.duration_sec) : "–"} · {r.source_type === "youtube" ? "YouTube" : "Upload"}
              </span>
              <span className="small" style={{ marginLeft: "auto" }}>
                {r.status === "done" ? (
                  <span className="chip verdict-supported">Faithfulness {Math.round((r.verification?.after ?? 0) * 100)}%</span>
                ) : r.error || r.status === "error" ? (
                  <span className="chip verdict-unsupported">Needs attention</span>
                ) : (
                  <span className="chip">{r.status}…</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
