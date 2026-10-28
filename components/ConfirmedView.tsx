"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import Magnetic from "@/components/fx/Magnetic";
import { createClient } from "@/lib/supabase/client";

/** The highlighter draws a check mark: the account is verified, like a sentence in a recap. */
function Check() {
  const reduced = useReducedMotion();
  return (
    <svg className="big-check" viewBox="0 0 88 88" aria-hidden="true">
      <motion.circle
        cx="44"
        cy="44"
        r="40"
        fill="none"
        stroke="#ffe45c"
        strokeWidth="4"
        initial={reduced ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.7, ease: [0.2, 0.7, 0.1, 1] }}
      />
      <motion.path
        d="M27 45 l11 11 l23 -25"
        fill="none"
        stroke="#ffe45c"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduced ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, delay: reduced ? 0 : 0.55, ease: "easeOut" }}
      />
    </svg>
  );
}

const rise = (delay: number, reduced: boolean | null) =>
  reduced ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay, ease: [0.2, 0.7, 0.1, 1] as const } };

export default function ConfirmedView({ state, error, signedIn }: { state: "ok" | "signin" | "error"; error?: string; signedIn: boolean }) {
  const reduced = useReducedMotion();

  if (state === "error") return <LinkProblem error={error} />;

  return (
    <div className="stack">
      <Check />
      <motion.h1 {...rise(0.6, reduced)} style={{ fontSize: "clamp(2.2rem, 5vw, 3.6rem)" }}>
        Your email is confirmed
      </motion.h1>
      <motion.p {...rise(0.75, reduced)} className="lede">
        {state === "signin"
          ? "Your account is active. You opened the link in another browser, so sign in once here to continue."
          : "Your account is ready. Paste a YouTube link or upload a lecture, and Recap will have notes for you in a few minutes."}
      </motion.p>
      <motion.div {...rise(0.9, reduced)} className="row" style={{ marginTop: 28 }}>
        {state === "signin" && !signedIn ? (
          <Link className="btn primary" href="/login?next=/app/new">
            Sign in
          </Link>
        ) : (
          <>
            <Magnetic>
              <Link className="btn primary" href="/app/new" style={{ minHeight: 54, padding: "0 26px" }}>
                Create your first recap
              </Link>
            </Magnetic>
            <Link className="btn" href="/app">
              Go to my recaps
            </Link>
          </>
        )}
      </motion.div>
    </div>
  );
}

function LinkProblem({ error }: { error?: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const expired = !error || /expired|invalid|used/i.test(error);

  async function resend(e: React.FormEvent) {
    e.preventDefault();
    setProblem(null);
    const { error: err } = await createClient().auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/auth/confirmed")}` },
    });
    if (err) setProblem(err.message);
    else setSent(true);
  }

  return (
    <div className="stack">
      <h1 style={{ fontSize: "clamp(2rem, 4.4vw, 3.2rem)" }}>{expired ? "This link has expired" : "We couldn't confirm your email"}</h1>
      <p className="lede">
        {expired
          ? "Confirmation links work once and for a limited time. Enter your email and we'll send a new one."
          : `The confirmation failed: ${error}. Enter your email to get a new link.`}
      </p>
      {sent ? (
        <p style={{ color: "var(--hi)" }}>A new link is on its way to {email}. It's valid for 24 hours.</p>
      ) : (
        <form className="stack" onSubmit={resend} style={{ marginTop: 24 }}>
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {problem && <p className="err">{problem}</p>}
          <button className="primary" type="submit">
            Send a new link
          </button>
        </form>
      )}
      <p className="muted small">
        Already confirmed? <Link href="/login">Sign in</Link>
      </p>
    </div>
  );
}
