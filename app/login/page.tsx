"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthFrame from "@/components/AuthFrame";
import { createClient } from "@/lib/supabase/client";

type View = "signin" | "signup" | "check";

const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/app");

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const reduced = useReducedMotion();
  const [view, setView] = useState<View>(params.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [cooldown, setCooldown] = useState(0);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent("/auth/confirmed")}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    if (view === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(
          /confirm/i.test(error.message)
            ? "Confirm your email first: open the link we sent you, then sign in."
            : /invalid/i.test(error.message)
              ? "That email and password don't match an account."
              : error.message,
        );
      } else {
        router.push(next);
        router.refresh();
        return;
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
      if (error) setError(error.message);
      else if (data.session) {
        router.push("/auth/confirmed");
        router.refresh();
        return;
      } else {
        setView("check");
        setCooldown(45);
      }
    }
    setBusy(false);
  }

  async function resend() {
    setError(null);
    const { error } = await createClient().auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectTo() } });
    if (error) setError(error.message);
    else {
      setResent(true);
      setCooldown(45);
    }
  }

  const anim = reduced
    ? {}
    : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 }, transition: { duration: 0.35, ease: [0.2, 0.7, 0.1, 1] as const } };

  return (
    <AnimatePresence mode="wait">
      {view === "check" ? (
        <motion.div key="check" {...anim} className="stack">
          <Envelope />
          <h1 style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}>Check your inbox</h1>
          <p className="lede">
            We sent a confirmation link to <b style={{ color: "var(--paper)" }}>{email}</b>. Open it on any device to activate your account.
          </p>
          <p className="muted small">Nothing after a minute? Look in your spam folder, or send the link again.</p>
          {error && <p className="err">{error}</p>}
          <div className="row">
            <button type="button" className="primary" onClick={resend} disabled={cooldown > 0}>
              {cooldown > 0 ? `Send again in ${cooldown}s` : resent ? "Send the link again" : "Resend the link"}
            </button>
            <button
              type="button"
              className="switch"
              onClick={() => {
                setView("signup");
                setBusy(false);
              }}
            >
              Use a different email
            </button>
          </div>
          {resent && cooldown > 0 && <p className="small" style={{ color: "var(--hi)" }}>A new link is on its way.</p>}
        </motion.div>
      ) : (
        <motion.div key={view} {...anim}>
          <h1 style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}>{view === "signin" ? "Welcome back" : "Create your account"}</h1>
          <p className="lede" style={{ marginTop: 12 }}>
            {view === "signin" ? "Sign in to see your recaps." : "Free to start, no card needed."}
          </p>
          <form className="stack" onSubmit={submit} style={{ marginTop: 32 }}>
            <div>
              <label htmlFor="email">Email</label>
              <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete={view === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {view === "signup" && <p className="muted small" style={{ marginTop: 8 }}>At least 8 characters.</p>}
            </div>
            {error && (
              <p className="err" role="alert">
                {error}
              </p>
            )}
            <button className="primary" type="submit" disabled={busy} style={{ width: "100%", minHeight: 52 }}>
              {busy ? "One moment…" : view === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
          <p className="muted" style={{ marginTop: 24 }}>
            {view === "signin" ? "New to Recap? " : "Already have an account? "}
            <button
              type="button"
              className="switch"
              onClick={() => {
                setError(null);
                setView(view === "signin" ? "signup" : "signin");
              }}
            >
              {view === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Envelope() {
  const reduced = useReducedMotion();
  return (
    <motion.svg
      width="72"
      height="72"
      viewBox="0 0 72 72"
      aria-hidden="true"
      initial={reduced ? false : { rotate: -8, scale: 0.8, opacity: 0 }}
      animate={{ rotate: 0, scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 16 }}
    >
      <rect x="6" y="16" width="60" height="42" rx="8" fill="none" stroke="#eef0ff" strokeWidth="3" />
      <path d="M8 20l28 20 28-20" fill="none" stroke="#ffe45c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </motion.svg>
  );
}

export default function LoginPage() {
  return (
    <AuthFrame>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthFrame>
  );
}
