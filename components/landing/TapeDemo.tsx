"use client";

import { useEffect, useState } from "react";

/*
 * Hero demo: the transcript runs past like tape while claims from the notes
 * get highlighted one by one, each with the moment it was said. It's a scripted
 * illustration of what a recap looks like (labelled as an example).
 */

const TRANSCRIPT = [
  ["03:12", "so a neuron is just a weighted sum followed by a non-linearity"],
  ["07:45", "if every layer were linear, the whole network would collapse into one linear map"],
  ["12:04", "the loss tells us how wrong we are, gradient descent tells us which way to move"],
  ["18:22", "backpropagation is the chain rule applied layer by layer, from the output back"],
  ["24:10", "learning rate too high and you overshoot, too low and you never get there"],
  ["31:37", "dropout randomly switches neurons off during training so they can't co-adapt"],
];

const CLAIMS = [
  { text: "Without non-linear activations, stacked layers reduce to a single linear map.", at: "07:45" },
  { text: "Backpropagation computes gradients by applying the chain rule from the output layer backwards.", at: "18:22" },
  { text: "A learning rate that is too high makes training overshoot the minimum.", at: "24:10" },
  { text: "Dropout disables random neurons during training to prevent co-adaptation.", at: "31:37" },
];

export default function TapeDemo() {
  const [lit, setLit] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLit(CLAIMS.length);
      return;
    }
    let i = 0;
    const id = window.setInterval(() => {
      i = i >= CLAIMS.length + 2 ? 0 : i + 1; // pause on the full list, then start over
      setLit(Math.min(i, CLAIMS.length));
    }, 1500);
    return () => window.clearInterval(id);
  }, []);

  const pct = Math.round((lit / CLAIMS.length) * 100);
  const loop = [...TRANSCRIPT, ...TRANSCRIPT];

  return (
    <div className="tape" role="img" aria-label="Example recap: notes from a neural networks lecture, each sentence highlighted once it is verified against the transcript, with its timestamp.">
      <div className="tape-head">
        <span className="tape-live">
          <i /> Example: neural networks, lecture 3
        </span>
        <span>Study notes</span>
      </div>
      <div className="tape-strip" aria-hidden="true">
        <div className="tape-track">
          {loop.map(([t, s], i) => (
            <span key={i}>
              <b>{t}</b>
              {s}
            </span>
          ))}
        </div>
      </div>
      <ul className="tape-claims" aria-hidden="true">
        {CLAIMS.map((c, i) => (
          <li key={c.text}>
            <span>
              <span className={`sweep${i < lit ? " on" : ""}`}>{c.text}</span>
            </span>
            <span className="chip" data-cursor={`▶ ${c.at}`} style={{ opacity: i < lit ? 1 : 0.35, transition: "opacity .4s" }}>
              {c.at}
            </span>
          </li>
        ))}
      </ul>
      <div className="tape-foot" aria-hidden="true">
        <span>Verified against the video</span>
        <div className="bar">
          <i style={{ width: `${pct}%` }} />
        </div>
        <b style={{ color: "var(--paper)", minWidth: "3ch", textAlign: "right" }}>{pct}%</b>
      </div>
    </div>
  );
}
