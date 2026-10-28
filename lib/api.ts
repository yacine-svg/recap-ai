import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Recap } from "@/lib/types";

export const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

/** The signed-in user and a database client acting as them, or an error response. */
export async function requireUser(): Promise<{ db: SupabaseClient; user: User } | NextResponse> {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return fail(401, "Please sign in first.");
  return { db, user };
}

export async function loadRecap(db: SupabaseClient, id: string, userId: string): Promise<Recap | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db.from("recaps").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  return (data as Recap | null) ?? null;
}

/** Turns provider / pipeline errors into a short message for the user. */
export function userMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/429|rate limit|quota|RESOURCE_EXHAUSTED/i.test(msg)) return "The AI provider's free-tier limit was reached. Wait a minute and retry.";
  if (/API_KEY|not set|401|403|permission/i.test(msg)) return "The AI provider rejected the request (check the API keys in the server settings).";
  return msg.length > 240 ? `${msg.slice(0, 240)}…` : msg;
}
