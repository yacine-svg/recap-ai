"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PipelineProgress from "@/components/PipelineProgress";
import { mediaDuration } from "@/lib/audio/extract";
import { runAgents, transcribeUpload, transcribeYoutube, type Progress } from "@/lib/client/process";
import { youtubeInfo } from "@/lib/client/youtube";
import { youtubeId } from "@/lib/pipeline/text";
import { LANGUAGES, MODE_LABELS, type Mode } from "@/lib/types";

export default function NewRecapForm({ youtube }: { youtube: boolean }) {
  const router = useRouter();
  const [source, setSource] = useState<"upload" | "youtube">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<Mode>("study");
  const [focus, setFocus] = useState("");
  const [lang, setLang] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [recapId, setRecapId] = useState<string | null>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      let duration = 0;
      let title = "";
      if (source === "upload") {
        if (!file) throw new Error("Choose a video or audio file.");
        duration = await mediaDuration(file);
        title = file.name;
      } else {
        const id = youtubeId(url);
        if (!id) throw new Error("That doesn't look like a YouTube link.");
        const info = await youtubeInfo(id);
        duration = info.duration;
        title = info.title;
      }

      const res = await fetch("/api/recaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_type: source, source_url: url, title, duration_sec: duration, mode, focus, output_language: lang }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "Could not create the recap.");
      try {
        if (source === "upload") await transcribeUpload(data.id, file!, setProgress);
        else await transcribeYoutube(data.id, duration, setProgress);
      } catch (err) {
        // a transcription that failed can't be resumed: remove it so it doesn't use up the daily quota
        await fetch(`/api/recaps/${data.id}`, { method: "DELETE" }).catch(() => {});
        setProgress(null);
        throw err;
      }
      setRecapId(data.id);
      await runAgents(data.id, "embedding", setProgress);
      router.push(`/app/r/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid2">
      <form className="panel stack" onSubmit={start}>
        <div>
          <h1 style={{ fontSize: "clamp(2rem, 4vw, 2.8rem)" }}>New recap</h1>
          <p className="muted" style={{ marginTop: 8 }}>A 10-minute video takes about a minute. Keep this tab open while the agents work.</p>
        </div>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={source === "upload"} onClick={() => setSource("upload")} disabled={busy}>
            Upload a file
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={source === "youtube"}
            onClick={() => setSource("youtube")}
            disabled={busy || !youtube}
            title={youtube ? undefined : "YouTube links need a Gemini API key with access (paid tier on some accounts)"}
          >
            YouTube link{youtube ? "" : " (unavailable)"}
          </button>
        </div>

        {source === "upload" ? (
          <div>
            <label htmlFor="file">Video or audio (MP4, WebM, MP3, M4A, WAV)</label>
            <input id="file" type="file" accept="video/*,audio/*" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <p className="muted small">Your video never leaves your device: only the speech audio, in small pieces, is sent for transcription.</p>
          </div>
        ) : (
          <div>
            <label htmlFor="url">Public YouTube video</label>
            <input id="url" type="url" placeholder="https://www.youtube.com/watch?v=…" value={url} disabled={busy} onChange={(e) => setUrl(e.target.value)} />
          </div>
        )}

        <div>
          <label htmlFor="mode">What do you need?</label>
          <select id="mode" value={mode} disabled={busy} onChange={(e) => setMode(e.target.value as Mode)}>
            {Object.entries(MODE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}: {v.hint}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="focus">Your focus (optional)</label>
          <input
            id="focus"
            placeholder="e.g. How does backpropagation compute gradients?"
            value={focus}
            disabled={busy}
            maxLength={300}
            onChange={(e) => setFocus(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="lang">Summary language</label>
          <select id="lang" value={lang} disabled={busy} onChange={(e) => setLang(e.target.value)}>
            {Object.entries(LANGUAGES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <p className="err">
            {error}
            {recapId && (
              <>
                {" "}
                <a href={`/app/r/${recapId}`}>Open the recap to retry</a>
              </>
            )}
          </p>
        )}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Working… keep this tab open" : "Create recap"}
        </button>
      </form>
      <PipelineProgress progress={progress} upload={source === "upload"} />
    </div>
  );
}
