"use client";

import { useRef, useState } from "react";

const GLYPHS = "abcdefghijklmnopqrstuvwxyz0123456789:";

/** On hover, the letters shuffle and resolve left to right, like a transcript being decoded. */
export default function Scramble({ text, className }: { text: string; className?: string }) {
  const [shown, setShown] = useState(text);
  const timer = useRef<number | null>(null);

  const run = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (timer.current) cancelAnimationFrame(timer.current);
    const start = performance.now();
    const duration = 420;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const fixed = Math.floor(p * text.length);
      setShown(
        text
          .split("")
          .map((c, i) => (i < fixed || c === " " ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0]))
          .join(""),
      );
      if (p < 1) timer.current = requestAnimationFrame(tick);
      else setShown(text);
    };
    timer.current = requestAnimationFrame(tick);
  };

  return (
    <span className={className} onPointerEnter={run} aria-label={text}>
      <span aria-hidden="true">{shown}</span>
    </span>
  );
}
