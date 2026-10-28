"use client";

import { useEffect } from "react";

/*
 * Optional Unicorn Studio scene. Design a scene at unicorn.studio, publish it,
 * then set NEXT_PUBLIC_UNICORN_PROJECT_ID in Vercel. Without an ID nothing renders.
 */

declare global {
  interface Window {
    UnicornStudio?: { isInitialized?: boolean; init: () => Promise<unknown> };
  }
}

const SRC =
  process.env.NEXT_PUBLIC_UNICORN_SCRIPT ?? "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v1.4.29/dist/unicornStudio.umd.js";

export default function UnicornScene({ className }: { className?: string }) {
  const id = process.env.NEXT_PUBLIC_UNICORN_PROJECT_ID;

  useEffect(() => {
    if (!id || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const init = () => void window.UnicornStudio?.init().catch(() => {});
    if (window.UnicornStudio) return init();
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = init;
    document.head.appendChild(s);
  }, [id]);

  if (!id) return null;
  return <div className={className} data-us-project={id} aria-hidden="true" />;
}
