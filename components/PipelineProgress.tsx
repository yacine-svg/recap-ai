"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Progress } from "@/lib/client/process";
import type { Status } from "@/lib/types";

/* Live agent console: which agent is working, what it's doing, how long it has taken. */

const STEPS: { key: Status | "extracting"; agent: string; doing: string }[] = [
  { key: "extracting", agent: "Transcriber", doing: "Extracting the audio in your browser" },
  { key: "transcribing", agent: "Transcriber", doing: "Turning speech into text" },
  { key: "embedding", agent: "Indexer", doing: "Building the searchable index of the transcript" },
  { key: "structuring", agent: "Scout", doing: "Finding where the topic changes, naming chapters" },
  { key: "analyzing", agent: "Analyst", doing: "Picking key moments and concepts" },
  { key: "writing", agent: "Writer", doing: "Writing your notes" },
  { key: "verifying", agent: "Verifier", doing: "Checking every sentence against the video" },
  { key: "studying", agent: "Tutor", doing: "Making flashcards and a quiz" },
];

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function PipelineProgress({ progress, upload }: { progress: Progress | null; upload: boolean }) {
  const reduced = useReducedMotion();
  const started = useRef<number | null>(null);
  const stepStart = useRef<{ key: string; at: number }>({ key: "", at: 0 });
  const [now, setNow] = useState(0);

  const current: Status | "extracting" | null = !progress
    ? null
    : progress.phase === "extracting"
      ? "extracting"
      : progress.phase === "transcribing"
        ? "transcribing"
        : (progress.status ?? "embedding");

  useEffect(() => {
    if (!current || current === "done") return;
    if (started.current === null) started.current = Date.now();
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [current]);

  if (!progress || !current) {
    return (
      <div className="run">
        <div className="run-head">
          <span>Agents</span>
          <span className="muted">Waiting for a video</span>
        </div>
        <ul className="run-list">
          {STEPS.filter((s) => upload || s.key !== "extracting").map((s) => (
            <li key={s.key}>
              <span className="dot" />
              <span>{s.agent}</span>
              <span />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (stepStart.current.key !== current) stepStart.current = { key: current, at: Date.now() };
  const steps = upload ? STEPS : STEPS.filter((s) => s.key !== "extracting");
  const at = current === "done" ? steps.length : steps.findIndex((s) => s.key === current);
  const detail =
    progress.phase === "transcribing" && progress.total > 1 ? ` (${progress.done} of ${progress.total} pieces)` : "";
  const elapsed = started.current ? fmt((now || Date.now()) - started.current) : "0:00";

  return (
    <div className="run" aria-live="polite">
      <div className="run-head">
        <span>{current === "done" ? "Recap ready" : `${steps[at]?.agent ?? "Agents"} is working`}</span>
        <span className="muted">{elapsed}</span>
      </div>
      <ul className="run-list">
        {steps.map((s, i) => {
          const state = i < at ? "done" : i === at ? "on" : "";
          return (
            <li key={s.key} className={state}>
              <span className="dot" />
              <span>
                {s.agent}
                <AnimatePresence initial={false}>
                  {state === "on" && (
                    <motion.span
                      className="sub"
                      initial={reduced ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      {s.doing}
                      {s.key === "transcribing" ? detail : ""}
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              <span className="small muted">{state === "done" ? "done" : state === "on" ? fmt((now || Date.now()) - stepStart.current.at) : ""}</span>
            </li>
          );
        })}
      </ul>
      {progress.phase === "transcribing" && progress.total > 1 && (
        <div style={{ padding: "0 18px 16px" }}>
          <div className="bar">
            <i style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
