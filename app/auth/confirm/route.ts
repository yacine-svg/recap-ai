import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/*
 * Link target for the custom email template (supabase/email-templates):
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
 * Verifying the token hash works on any device, unlike the code exchange.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "email") as EmailOtpType;
  if (!tokenHash) return NextResponse.redirect(new URL("/login", url.origin));

  const db = await createClient();
  const { error } = await db.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return NextResponse.redirect(new URL(`/auth/confirmed?error=${encodeURIComponent(error.message)}`, url.origin));
  return NextResponse.redirect(new URL("/auth/confirmed", url.origin));
}
