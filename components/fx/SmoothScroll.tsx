"use client";

import "lenis/dist/lenis.css";
import { ReactLenis } from "lenis/react";
import { useEffect, useState } from "react";

/** Lenis smooth scrolling for the whole page, off for people who prefer reduced motion. */
export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(!q.matches);
    update();
    q.addEventListener("change", update);
    return () => q.removeEventListener("change", update);
  }, []);
  if (!enabled) return <>{children}</>;
  return (
    <ReactLenis root options={{ lerp: 0.11, smoothWheel: true, wheelMultiplier: 0.95 }}>
      {children}
    </ReactLenis>
  );
}
