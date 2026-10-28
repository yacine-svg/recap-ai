import Link from "next/link";
import { redirect } from "next/navigation";
import Magnetic from "@/components/fx/Magnetic";
import { env } from "@/lib/env";
import { formatTime } from "@/lib/pipeline/text";
import { createClient } from "@/lib/supabase/server";
import { MODE_LABELS, type Recap } from "@/lib/types";

export const metadata = { title: "My recaps" };

type Row = Pick<Recap, "id" | "title" | "status" | "error" | "mode" | "duration_sec" | "source_type" | "created_at" | "verification">;

function Status({ r }: { r: Row }) {
  if (r.status === "done")
    return (
      <span className="chip verdict-supported" title="Share of sentences supported by the video">
        {Math.round((r.verification?.after ?? 0) * 100)}% verified
      </span>
    );
  if (r.error || r.status === "error") return <span className="chip verdict-unsupported">Needs attention</span>;
  return <span className="chip">In progress</span>;
}

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
  const recaps = (data ?? []) as Row[];

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const left = Math.max(0, env.dailyLimit() - recaps.filter((r) => new Date(r.created_at) >= since).length);

  return (
    <div className="stack" style={{ maxWidth: 980 }}>
      <div className="row" style={{ alignItems: "end", marginBottom: 24 }}>
        <div style={{ flex: "1 1 320px" }}>
          <h1 style={{ fontSize: "clamp(2rem, 4.4vw, 3.2rem)" }}>My recaps</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            {left > 0 ? `${left} of ${env.dailyLimit()} recaps left today` : "You've used today's recaps. New ones tomorrow."}, videos up to {env.maxMinutes()}{" "}
            minutes.
          </p>
        </div>
        {left > 0 && (
          <Magnetic>
            <Link className="btn primary" href="/app/new">
              New recap
            </Link>
          </Magnetic>
        )}
      </div>

      {recaps.length === 0 ? (
        <div className="panel" style={{ padding: "48px 32px" }}>
          <h2 style={{ fontSize: "1.8rem" }}>Your first recap is one link away</h2>
          <p className="muted" style={{ marginTop: 12, maxWidth: "52ch" }}>
            Paste a YouTube lecture or upload a recording. You'll get chapters, notes checked against the video, flashcards and a quiz.
          </p>
          <Link className="btn primary" href="/app/new" style={{ marginTop: 24 }}>
            Create a recap
          </Link>
        </div>
      ) : (
        <ul className="list">
          {recaps.map((r) => (
            <li key={r.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "6px 16px", alignItems: "center" }}>
              <Link href={`/app/r/${r.id}`} style={{ fontWeight: 700, fontSize: "1.1rem", textDecoration: "none" }}>
                {r.title}
              </Link>
              <Status r={r} />
              <span className="muted small">
                {MODE_LABELS[r.mode]?.label}, {r.duration_sec ? formatTime(r.duration_sec) : "unknown length"}, {r.source_type === "youtube" ? "YouTube" : "uploaded file"}
              </span>
              <span className="muted small">{new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
