"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Magnetic from "@/components/fx/Magnetic";

export function Logo() {
  // a play head over a highlighted line: "this moment, checked"
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <rect x="1" y="9" width="24" height="8" rx="2" fill="#ffe45c" />
      <rect x="11.5" y="2" width="3" height="22" rx="1.5" fill="#eef0ff" />
    </svg>
  );
}

export default function Header({ signedIn }: { signedIn: boolean }) {
  const [solid, setSolid] = useState(false);
  const path = usePathname();
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  if (path?.startsWith("/login") || path?.startsWith("/auth")) return null; // auth screens have their own frame

  return (
    <header className={`hd${solid || path !== "/" ? " solid" : ""}`}>
      <Link className="brand" href={signedIn ? "/app" : "/"}>
        <Logo />
        Recap
      </Link>
      <nav aria-label="Main">
        {signedIn ? (
          <>
            <Link href="/app">My recaps</Link>
            <form action="/auth/signout" method="post" className="hide-sm">
              <button type="submit" style={{ border: 0, color: "var(--fog)", fontWeight: 400 }}>
                Sign out
              </button>
            </form>
            <Magnetic>
              <Link className="btn primary" href="/app/new">
                New recap
              </Link>
            </Magnetic>
          </>
        ) : (
          <>
            <a className="hide-sm" href="/#how">
              How it works
            </a>
            <a className="hide-sm" href="/#pricing">
              Pricing
            </a>
            <Link href="/login">Sign in</Link>
            <Magnetic>
              <Link className="btn primary" href="/login?mode=signup">
                Start free
              </Link>
            </Magnetic>
          </>
        )}
      </nav>
    </header>
  );
}
