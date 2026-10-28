import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/*
 * Supabase sends people here after they click the link in the confirmation
 * email (default email template). We turn the code into a session.
 * If the link was opened in another browser, the code can't be exchanged, but
 * the email IS confirmed by then, so we just ask them to sign in.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/auth/confirmed";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/auth/confirmed";
  const linkError = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (linkError) return NextResponse.redirect(new URL(`/auth/confirmed?error=${encodeURIComponent(linkError)}`, url.origin));
  if (!code) return NextResponse.redirect(new URL("/login", url.origin));

  const db = await createClient();
  const { error } = await db.auth.exchangeCodeForSession(code);
  if (!error) return NextResponse.redirect(new URL(next, url.origin));
  if (/verifier|code challenge/i.test(error.message)) return NextResponse.redirect(new URL("/auth/confirmed?signin=1", url.origin));
  return NextResponse.redirect(new URL(`/auth/confirmed?error=${encodeURIComponent(error.message)}`, url.origin));
}
