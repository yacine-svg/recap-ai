import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { default: "Recap: verified AI summaries of lectures and videos", template: "%s · Recap" },
  description:
    "Recap turns lectures, talks and YouTube videos into chapters, fact-checked summaries, flashcards and quizzes, with every claim linked to the moment it was said.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  return (
    <html lang="en">
      <body>
        <div className="wrap">
          <header className="top">
            <Link className="brand" href="/">
              Recap
            </Link>
            <nav>
              {user ? (
                <>
                  <Link href="/app">My recaps</Link>
                  <Link className="btn primary" href="/app/new">
                    New recap
                  </Link>
                  <form action="/auth/signout" method="post">
                    <button type="submit">Sign out</button>
                  </form>
                </>
              ) : (
                <Link className="btn primary" href="/login">
                  Sign in
                </Link>
              )}
            </nav>
          </header>
          <main>{children}</main>
          <footer className="muted small" style={{ padding: "40px 0" }}>
            Recap · built by Sekhri Mohammed Yassine
          </footer>
        </div>
      </body>
    </html>
  );
}
