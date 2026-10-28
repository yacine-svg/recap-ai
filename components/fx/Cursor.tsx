"use client";

import { useEffect, useRef, useState } from "react";

/*
 * A highlighter-dot cursor. Over links and buttons it grows; over anything
 * with data-cursor="…" it becomes a pill showing that text (for example the
 * timestamp a chip will play). Fine pointers only; touch devices keep theirs.
 */
export default function Cursor() {
  const el = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [big, setBig] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine) return;
    document.documentElement.classList.add("has-cursor");
    let x = innerWidth / 2;
    let y = innerHeight / 2;
    let cx = x;
    let cy = y;
    let raf = 0;
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      const t = (e.target as Element | null)?.closest?.("[data-cursor], a, button, summary, [role='button'], input[type='file']");
      const text = t?.getAttribute("data-cursor");
      setLabel(text ?? null);
      setBig(!!t && !text);
    };
    const loop = () => {
      cx += (x - cx) * (reduced ? 1 : 0.22);
      cy += (y - cy) * (reduced ? 1 : 0.22);
      if (el.current) el.current.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      raf = requestAnimationFrame(loop);
    };
    const hide = () => el.current && (el.current.style.opacity = "0");
    const show = () => el.current && (el.current.style.opacity = "1");
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("mouseleave", hide);
    document.documentElement.addEventListener("mouseenter", show);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("mouseleave", hide);
      document.documentElement.removeEventListener("mouseenter", show);
      document.documentElement.classList.remove("has-cursor");
    };
  }, []);

  return (
    <div ref={el} className={`cursor${label ? " label" : big ? " big" : ""}`} aria-hidden="true" style={big && !label ? { mixBlendMode: "difference" } : undefined}>
      {label}
    </div>
  );
}
