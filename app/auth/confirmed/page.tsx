import AuthFrame from "@/components/AuthFrame";
import ConfirmedView from "@/components/ConfirmedView";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Email confirmed" };

export default async function Confirmed({ searchParams }: { searchParams: Promise<{ error?: string; signin?: string }> }) {
  const sp = await searchParams;
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const state = sp.error ? "error" : sp.signin && !user ? "signin" : "ok";
  return (
    <AuthFrame quote={state === "error" ? "One more click and you're in." : "Welcome to Recap."}>
      <ConfirmedView state={state} error={sp.error} signedIn={!!user} />
    </AuthFrame>
  );
}
