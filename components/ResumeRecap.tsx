"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PipelineProgress from "@/components/PipelineProgress";
import { deleteGuestRecap, guestApi } from "@/lib/client/guest-store";
import { runAgents, serverApi, type Progress } from "@/lib/client/process";
import type { Recap } from "@/lib/types";

/** Shown for a recap that isn't finished: continues the agents where they stopped. */
export default function ResumeRecap({ recap, guest = false }: { recap: Pick<Recap, "id" | "status" | "error" | "source_type">; guest?: boolean }) {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(recap.error);
  const [running, setRunning] = useState(false);
  const started = useRef(false);

  const resume = async () => {
    setRunning(true);
    setError(null);
    try {
      await runAgents(guest ? guestApi(recap.id) : serverApi(recap.id), recap.status, setProgress);
      if (!guest) router.refresh(); // guests: the page re-reads browser storage on its own
    } catch (e) {
      setError((e as Error).message);
      setRunning(false);
    }
  };

  // continue automatically if the last attempt didn't fail
  useEffect(() => {
    if (started.current || recap.status === "transcribing" || recap.status === "error" || recap.error) return;
    started.current = true;
    void resume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (recap.status === "transcribing" || recap.status === "error") {
    return (
      <div className="panel stack">
        <p className="err" style={{ margin: 0 }}>
          {recap.error ?? "The transcription was interrupted (the tab was closed before it finished)."}
        </p>
        <p className="muted small">Delete this recap and create it again{recap.source_type === "upload" ? " with the same file" : ""}.</p>
        <DeleteButton id={recap.id} guest={guest} />
      </div>
    );
  }

  return (
    <div className="stack">
      <PipelineProgress progress={progress ?? { phase: "agents", done: 0, total: 6, status: recap.status }} upload={false} />
      {error && <p className="err">{error}</p>}
      {!running && (
        <button className="primary" type="button" onClick={resume}>
          {error ? "Retry" : "Continue"}
        </button>
      )}
    </div>
  );
}

function DeleteButton({ id, guest }: { id: string; guest: boolean }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        if (guest) deleteGuestRecap(id);
        else await fetch(`/api/recaps/${id}`, { method: "DELETE" });
        router.push("/app/new");
      }}
    >
      Delete and start again
    </button>
  );
}
