"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

const AGENTS = [
  {
    name: "Transcriber",
    text: "Turns speech into text. For an uploaded file, the audio is extracted in your browser, so the video never leaves your device. For YouTube, it reads the captions.",
    log: [
      ["00:00", "Decoding audio at 16 kHz in the browser"],
      ["00:02", "Cutting 33 pieces at natural pauses"],
      ["00:41", "1,284 lines of speech transcribed"],
    ],
  },
  {
    name: "Indexer",
    text: "Cuts the transcript into 40-second passages and turns each one into a vector, so the other agents can find any idea in the video.",
    log: [
      ["00:42", "92 passages of about 40 seconds"],
      ["00:42", "Vectorised into a 768-dimension index"],
    ],
  },
  {
    name: "Scout",
    text: "Finds the places where the topic changes and splits the video into chapters, then gives each one a title.",
    log: [
      ["00:43", "Similarity drops at 12:40, 26:05 and 41:30"],
      ["00:44", "4 chapters, from “What a neuron computes” to “Regularisation”"],
    ],
  },
  {
    name: "Analyst",
    text: "Picks the moments that matter most without repeating itself, and lists the key concepts with their definitions.",
    log: [
      ["00:46", "7 key moments, at most 2 per chapter"],
      ["00:47", "Concepts: activation, loss, chain rule, dropout…"],
    ],
  },
  {
    name: "Writer",
    text: "Writes the notes you asked for: a quick overview, study notes, exam revision or meeting minutes, and answers your question first if you gave one.",
    log: [
      ["00:49", "Mode: exam revision"],
      ["00:52", "5 sections, 24 sentences to check"],
    ],
  },
  {
    name: "Verifier",
    text: "Checks every sentence against the passages it came from. Anything the video doesn't support goes back to the Writer to be fixed, then gets checked again.",
    log: [
      ["00:54", "20 supported, 3 partly, 1 not found"],
      ["00:57", "4 sentences rewritten from the evidence"],
      ["00:58", "Faithfulness 85% → 98%"],
    ],
  },
  {
    name: "Tutor",
    text: "Turns the notes into flashcards and a quiz, each one linked to the chapter it comes from.",
    log: [
      ["01:00", "12 flashcards"],
      ["01:01", "10-question quiz ready"],
    ],
  },
];

export default function AgentScroll() {
  const [active, setActive] = useState(0);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const reduced = useReducedMotion();

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    items.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const agent = AGENTS[active];
  return (
    <div className="agents">
      <ol className="agents-list">
        {AGENTS.map((a, i) => (
          <li key={a.name} data-i={i} ref={(el) => void (items.current[i] = el)} className={i === active ? "on" : ""}>
            <span className="n">{i + 1}</span>
            <h3>{a.name}</h3>
            <p>{a.text}</p>
          </li>
        ))}
      </ol>
      <div className="console-wrap">
        <div className="console" aria-live="polite">
          <div className="console-head">
            <i />
            <i />
            <i />
            <span style={{ marginLeft: 8 }}>Example run: {agent.name}</span>
          </div>
          <div className="console-body">
            <AnimatePresence mode="wait">
              <motion.div
                key={agent.name}
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.35, ease: [0.2, 0.7, 0.1, 1] }}
                style={{ display: "grid", gap: 12 }}
              >
                {AGENTS.slice(0, active).map((a) => (
                  <div key={a.name} className="console-line">
                    <span className="t">done</span>
                    <span className="muted">
                      {a.name}: {a.log[a.log.length - 1][1]}
                    </span>
                  </div>
                ))}
                {agent.log.map(([t, line], i) => (
                  <motion.div
                    key={line}
                    className="console-line"
                    initial={reduced ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: reduced ? 0 : 0.25 + i * 0.35 }}
                  >
                    <span className="t">{t}</span>
                    <span className={i === agent.log.length - 1 ? "ok" : undefined}>{line}</span>
                  </motion.div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
