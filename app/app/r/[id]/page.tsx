import { notFound, redirect } from "next/navigation";
import RecapView from "@/components/RecapView";
import ResumeRecap from "@/components/ResumeRecap";
import { createClient } from "@/lib/supabase/server";
import type { Recap } from "@/lib/types";

export default async function RecapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect(`/login?next=/app/r/${id}`);

  const { data } = await db.from("recaps").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  const recap = data as Recap | null;
  if (!recap) notFound();

  if (recap.status !== "done") {
    return (
      <div className="stack" style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)" }}>{recap.title}</h1>
        <ResumeRecap recap={recap} />
      </div>
    );
  }
  return <RecapView recap={recap} editable />;
}
