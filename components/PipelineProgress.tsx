"use client";

import type { Progress } from "@/lib/client/process";
import type { Status } from "@/lib/types";

const STEPS: { key: Status | "extracting"; label: string }[] = [
  { key: "extracting", label: "Transcriber: extracting audio in your browser" },
  { key: "transcribing", label: "Transcriber: speech to text" },
  { key: "embedding", label: "Indexer: building the vector index" },
  { key: "structuring", label: "Scout: detecting chapters" },
  { key: "analyzing", label: "Analyst: key moments & concepts" },
  { key: "writing", label: "Writer: drafting your summary" },
  { key: "verifying", label: "Verifier: fact-checking every claim" },
  { key: "studying", label: "Tutor: flashcards & quiz" },
];

export default function PipelineProgress({ progress, upload }: { progress: Progress | null; upload: boolean }) {
  if (!progress) return null;
  const current: Status | "extracting" =
    progress.phase === "extracting" ? "extracting" : progress.phase === "transcribing" ? "transcribing" : (progress.status ?? "embedding");
  const steps = upload ? STEPS : STEPS.filter((s) => s.key !== "extracting");
  const at = steps.findIndex((s) => s.key === current);
  const pct =
    progress.phase === "transcribing" && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;
  return (
    <div className="panel">
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={s.key} className={current === "done" || i < at ? "done" : i === at ? "on" : ""}>
            {current === "done" || i < at ? "✓ " : i === at ? "▸ " : "· "}
            {s.label}
            {i === at && pct !== null ? ` (${progress.done}/${progress.total})` : ""}
          </li>
        ))}
      </ol>
      {pct !== null && (
        <div className="bar" style={{ marginTop: 10 }}>
          <i style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
