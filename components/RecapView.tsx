"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Player, { type PlayerHandle } from "@/components/Player";
import { formatTime } from "@/lib/pipeline/text";
import { MODE_LABELS, type Claim, type Recap } from "@/lib/types";

const TABS = ["Summary", "Chapters", "Key moments", "Flashcards", "Quiz", "Transcript", "How it was made"] as const;
type Tab = (typeof TABS)[number];

const VERDICT_LABEL = { supported: "verified", partial: "partly verified", unsupported: "not found in video" } as const;

export default function RecapView({ recap, editable }: { recap: Recap; editable: boolean }) {
  const player = useRef<PlayerHandle>(null);
  const [tab, setTab] = useState<Tab>("Summary");
  const seek = (t?: number) => t !== undefined && player.current?.seek(t);
  const T = ({ t }: { t?: number }) =>
    t === undefined ? null : (
      <button type="button" className="chip" onClick={() => seek(t)} title="Play from here">
        ▶ {formatTime(t)}
      </button>
    );

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ margin: 0, flex: "1 1 400px" }}>{recap.title}</h1>
        {editable && <OwnerActions recap={recap} />}
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        {MODE_LABELS[recap.mode]?.label} · {recap.duration_sec ? formatTime(recap.duration_sec) : ""}
        {recap.focus ? ` · Focus: “${recap.focus}”` : ""}
        {recap.verification ? ` · Faithfulness ${Math.round(recap.verification.after * 100)}%` : ""}
      </p>

      <div className="grid2">
        <div className="stack">
          <Player ref={player} sourceType={recap.source_type} sourceUrl={recap.source_url} />
          {recap.summary?.tldr && (
            <div className="panel">
              <b>TL;DR</b>
              <p style={{ marginBottom: 0 }}>{recap.summary.tldr}</p>
            </div>
          )}
        </div>

        <div>
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>
          <div className="panel">
            {tab === "Summary" && <SummaryTab recap={recap} T={T} />}
            {tab === "Chapters" && (
              <ol className="list">
                {(recap.chapters ?? []).map((c) => (
                  <li key={c.index}>
                    <div className="row">
                      <T t={c.start} />
                      <b>{c.title}</b>
                    </div>
                    <p className="muted" style={{ margin: "6px 0 0" }}>
                      {c.summary}
                    </p>
                  </li>
                ))}
              </ol>
            )}
            {tab === "Key moments" && (
              <div className="stack">
                <ul className="list">
                  {(recap.key_moments ?? []).map((m) => (
                    <li key={m.windowId}>
                      <T t={m.start} /> <i>“{m.quote}”</i>
                      {m.why && <p className="muted small" style={{ margin: "6px 0 0" }}>{m.why}</p>}
                    </li>
                  ))}
                </ul>
                {!!recap.concepts?.length && (
                  <>
                    <h3>Key concepts</h3>
                    <ul className="list">
                      {recap.concepts.map((c) => (
                        <li key={c.term}>
                          <b>{c.term}</b>: {c.definition} <T t={c.start} />
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            {tab === "Flashcards" && <Flashcards recap={recap} T={T} />}
            {tab === "Quiz" && <Quiz recap={recap} T={T} />}
            {tab === "Transcript" && <TranscriptTab recap={recap} seek={seek} />}
            {tab === "How it was made" && <TraceTab recap={recap} />}
          </div>
        </div>
      </div>
    </div>
  );
}

type TProps = { T: (p: { t?: number }) => React.ReactNode; recap: Recap };

function ClaimLine({ c, T }: { c: Claim; T: TProps["T"] }) {
  const v = c.verdict ?? "unsupported";
  return (
    <li>
      {c.text}{" "}
      <span className={`chip verdict-${v}`} title={c.original ? `Revised by the Verifier. First draft: “${c.original}”` : undefined}>
        {VERDICT_LABEL[v]}
        {c.original ? " · revised" : ""}
      </span>{" "}
      <T t={c.evidenceStart} />
    </li>
  );
}

function SummaryTab({ recap, T }: TProps) {
  if (!recap.summary) return <p className="muted">No summary yet.</p>;
  return (
    <div className="stack">
      {recap.summary.sections.map((s) => (
        <section key={s.heading}>
          <h3 style={{ margin: "0 0 8px" }}>{s.heading}</h3>
          <ul className="stack" style={{ paddingLeft: 18 }}>
            {s.claims.map((c) => (
              <ClaimLine key={c.id} c={c} T={T} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Flashcards({ recap, T }: TProps) {
  const cards = recap.flashcards ?? [];
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (!cards.length) return <p className="muted">No flashcards.</p>;
  const c = cards[i];
  const go = (d: number) => {
    setI((i + d + cards.length) % cards.length);
    setFlipped(false);
  };
  return (
    <div className="stack">
      <div className="panel card" onClick={() => setFlipped(!flipped)} role="button" tabIndex={0} onKeyDown={(e) => e.key === " " && setFlipped(!flipped)}>
        <div>
          <p className="muted small">{flipped ? "Answer" : "Question"} · click to flip</p>
          <p style={{ fontSize: "1.1rem" }}>{flipped ? c.back : c.front}</p>
        </div>
      </div>
      <div className="row">
        <button type="button" onClick={() => go(-1)}>
          ← Prev
        </button>
        <span className="muted small">
          {i + 1} / {cards.length}
        </span>
        <button type="button" onClick={() => go(1)}>
          Next →
        </button>
        <span style={{ marginLeft: "auto" }}>
          <T t={c.start} />
        </span>
      </div>
    </div>
  );
}

function Quiz({ recap, T }: TProps) {
  const qs = recap.quiz ?? [];
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);
  if (!qs.length) return <p className="muted">No quiz.</p>;
  const score = qs.filter((q, i) => answers[i] === q.answer).length;
  return (
    <div className="stack">
      {qs.map((q, qi) => (
        <fieldset key={qi} className="panel" style={{ border: "1px solid var(--line)" }}>
          <legend>
            <b>
              {qi + 1}. {q.question}
            </b>
          </legend>
          {q.options.map((o, oi) => {
            const color = checked ? (oi === q.answer ? "var(--ok)" : answers[qi] === oi ? "var(--bad)" : undefined) : undefined;
            return (
              <label key={oi} style={{ display: "flex", gap: 8, color: color ?? "var(--ink)" }}>
                <input
                  type="radio"
                  style={{ width: "auto" }}
                  name={`q${qi}`}
                  checked={answers[qi] === oi}
                  disabled={checked}
                  onChange={() => setAnswers({ ...answers, [qi]: oi })}
                />
                {o}
              </label>
            );
          })}
          {checked && (
            <p className="small muted">
              {q.explanation} <T t={q.start} />
            </p>
          )}
        </fieldset>
      ))}
      <div className="row">
        {checked ? (
          <>
            <b>
              Score: {score} / {qs.length}
            </b>
            <button
              type="button"
              onClick={() => {
                setAnswers({});
                setChecked(false);
              }}
            >
              Try again
            </button>
          </>
        ) : (
          <button type="button" className="primary" onClick={() => setChecked(true)} disabled={Object.keys(answers).length < qs.length}>
            Check my answers
          </button>
        )}
      </div>
    </div>
  );
}

function TranscriptTab({ recap, seek }: { recap: Recap; seek: (t?: number) => void }) {
  const [q, setQ] = useState("");
  const segs = useMemo(() => {
    const all = recap.transcript?.segments ?? [];
    const s = q.trim().toLowerCase();
    return s ? all.filter((x) => x.text.toLowerCase().includes(s)) : all;
  }, [q, recap.transcript]);
  return (
    <div className="stack">
      <input placeholder="Search the transcript…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="transcript">
        {segs.map((s, i) => (
          <p key={i}>
            <button type="button" className="chip" onClick={() => seek(s.start)}>
              {formatTime(s.start)}
            </button>{" "}
            {s.text}
          </p>
        ))}
      </div>
    </div>
  );
}

function TraceTab({ recap }: { recap: Recap }) {
  const v = recap.verification;
  return (
    <div className="stack">
      {v && (
        <div>
          <h3 style={{ marginTop: 0 }}>Fact-checking</h3>
          <p>
            Faithfulness of the first draft: <b>{Math.round(v.before * 100)}%</b> → after self-correction: <b>{Math.round(v.after * 100)}%</b>
            <br />
            <span className="muted small">
              {v.counts.supported} verified · {v.counts.partial} partly verified · {v.counts.unsupported} not found · {v.revised} claims rewritten by the
              Writer. Score = (verified + ½ × partial) / claims, judged against the 3 most similar transcript passages of each claim.
            </span>
          </p>
        </div>
      )}
      <h3>Agents</h3>
      <ol className="list">
        {recap.trace.map((t, i) => (
          <li key={i}>
            <b>{t.agent}</b> <span className="muted small">· {(t.ms / 1000).toFixed(1)} s{t.model ? ` · ${t.model}` : ""}</span>
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              {t.note}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function OwnerActions({ recap }: { recap: Recap }) {
  const router = useRouter();
  const [isPublic, setPublic] = useState(recap.is_public);
  const [copied, setCopied] = useState(false);
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/r/${recap.id}` : `/r/${recap.id}`;

  async function toggle() {
    const next = !isPublic;
    const res = await fetch(`/api/recaps/${recap.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_public: next }),
    });
    if (res.ok) setPublic(next);
  }
  async function remove() {
    if (!confirm("Delete this recap for good?")) return;
    const res = await fetch(`/api/recaps/${recap.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/app");
      router.refresh();
    }
  }
  return (
    <div className="row">
      <button type="button" onClick={toggle}>
        {isPublic ? "Public link: on" : "Make public link"}
      </button>
      {isPublic && (
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(shareUrl).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
      )}
      <button type="button" onClick={remove}>
        Delete
      </button>
    </div>
  );
}
