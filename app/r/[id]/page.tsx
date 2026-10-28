import type { Metadata } from "next";
import { notFound } from "next/navigation";
import RecapView from "@/components/RecapView";
import { createClient } from "@/lib/supabase/server";
import type { Recap } from "@/lib/types";

/* Public share page: readable by anyone once the owner turned the link on (enforced by RLS). */

async function load(id: string): Promise<Recap | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await createClient();
  const { data } = await db.from("recaps").select("*").eq("id", id).eq("is_public", true).eq("status", "done").maybeSingle();
  return (data as Recap | null) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const recap = await load((await params).id);
  return recap ? { title: recap.title, description: recap.summary?.tldr } : { title: "Recap not found" };
}

export default async function PublicRecap({ params }: { params: Promise<{ id: string }> }) {
  const recap = await load((await params).id);
  if (!recap) notFound();
  return <RecapView recap={recap} editable={false} />;
}
