import Link from "next/link";

/** Public share pages: the recap plus a quiet invitation to make your own. */
export default function SharedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="wrap app-main">{children}</main>
      <footer className="ft">
        <span>Made with Recap: notes from videos, checked against what was said.</span>
        <Link href="/login?mode=signup">Recap your own video</Link>
      </footer>
    </>
  );
}
