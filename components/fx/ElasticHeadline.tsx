"use client";

import { useEffect, useRef } from "react";

/*
 * Headline whose letters stretch as the cursor passes, using Archivo's width
 * axis ("wdth" 62–125). Each frame: distance from the pointer to every letter
 * → a falloff → that letter's width. Static (and fully readable) for touch
 * screens and reduced motion.
 */
export default function ElasticHeadline({ lines, className }: { lines: string[]; className?: string }) {
  const root = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const h = root.current;
    if (!h) return;
    if (!window.matchMedia("(pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const chars = Array.from(h.querySelectorAll<HTMLElement>(".ch"));
    let px = -9999;
    let py = -9999;
    let raf = 0;
    let dirty = false;
    const BASE = 108;
    const MAX = 125;
    const MIN = 92;
    const RADIUS = 260;

    const frame = () => {
      raf = 0;
      if (!dirty) return;
      dirty = false;
      for (const c of chars) {
        const r = c.getBoundingClientRect();
        const d = Math.hypot(px - (r.left + r.width / 2), py - (r.top + r.height / 2));
        const k = Math.max(0, 1 - d / RADIUS);
        // close letters widen, letters at mid-distance narrow a little: the word "breathes"
        const w = Math.max(MIN, BASE + (MAX - BASE) * k * k - 14 * (1 - k) * k);
        c.style.setProperty("--w", w.toFixed(1));
      }
    };
    const move = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      dirty = true;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const leave = () => {
      px = py = -9999;
      dirty = true;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("mouseleave", leave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("mouseleave", leave);
    };
  }, []);

  return (
    <h1 ref={root} className={`elastic ${className ?? ""}`} aria-label={lines.join(" ")}>
      {lines.map((line, li) => (
        <span key={li} style={{ display: "block" }} aria-hidden="true">
          {line.split(" ").map((word, wi) => (
            <span key={wi} className="w">
              {word.split("").map((ch, ci) => (
                <span key={ci} className="ch">
                  {ch}
                </span>
              ))}
              {wi < line.split(" ").length - 1 ? " " : ""}
            </span>
          ))}
        </span>
      ))}
    </h1>
  );
}
