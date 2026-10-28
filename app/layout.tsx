import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Cursor from "@/components/fx/Cursor";
import SmoothScroll from "@/components/fx/SmoothScroll";
import { createClient } from "@/lib/supabase/server";

// One variable family; its width axis does the typographic work (wide headlines, normal text)
const archivo = Archivo({ subsets: ["latin", "latin-ext"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Recap: lecture notes you can trust", template: "%s · Recap" },
  description:
    "Recap turns lectures, talks and YouTube videos into chapters, notes, flashcards and quizzes, and checks every sentence against what was actually said.",
};

export const viewport: Viewport = { themeColor: "#0d1033", colorScheme: "dark" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  return (
    <html lang="en" className={archivo.variable}>
      <body>
        <SmoothScroll>
          <Header signedIn={!!user} />
          {children}
        </SmoothScroll>
        <Cursor />
      </body>
    </html>
  );
}
