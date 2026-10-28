import type { SupabaseClient } from "@supabase/supabase-js";
import { embed } from "@/lib/ai/gemini";
import { env } from "@/lib/env";
import type {
  Chapter,
  Claim,
  Concept,
  EmbeddedWindow,
  KeyMoment,
  Recap,
  Stage,
  Summary,
  TraceEntry,
  Verdict,
  Verification,
} from "@/lib/types";
import { analyst, languageRule, reviser, scout, tutor, verifier, writer } from "./agents";
import { detectChapters, pickKeyMoments } from "./segment";
import { buildWindows } from "./text";
import { parseVector, topK, toPgVector } from "./vector";

/*
 * The pipeline is a small state machine. Each call to `runStage` does ONE
 * stage and saves its result, so every HTTP request stays well under the
 * serverless time limit, progress survives a closed tab, and a failed stage
 * can simply be retried.
 *
 * transcribing (browser) → embedding → structuring → analyzing → writing → verifying → studying → done
 */

type Update = Partial<Omit<Recap, "id" | "user_id" | "created_at">>;
type Ctx = { db: SupabaseClient; recap: Recap };

const NEXT: Record<Exclude<Stage, "transcribing" | "done">, Stage> = {
  embedding: "structuring",
  structuring: "analyzing",
  analyzing: "writing",
  writing: "verifying",
  verifying: "studying",
  studying: "done",
};

function trace(agent: TraceEntry["agent"], stage: Stage, t0: number, note: string, model?: string): TraceEntry {
  return { agent, stage, ms: Date.now() - t0, model, note, at: new Date().toISOString() };
}

async function loadWindows(ctx: Ctx): Promise<EmbeddedWindow[]> {
  const { data, error } = await ctx.db
    .from("recap_windows")
    .select("idx,start_sec,end_sec,text,embedding")
    .eq("recap_id", ctx.recap.id)
    .order("idx");
  if (error) throw new Error(`Could not load transcript index: ${error.message}`);
  return (data ?? []).map((r) => ({
    idx: r.idx as number,
    start: r.start_sec as number,
    end: r.end_sec as number,
    text: r.text as string,
    embedding: parseVector(r.embedding),
  }));
}

const lang = (r: Recap) => languageRule(r.output_language, r.transcript?.language ?? "");

/* ---------- stages ---------- */

async function indexTranscript(ctx: Ctx): Promise<Update> {
  const t0 = Date.now();
  const segments = ctx.recap.transcript?.segments ?? [];
  const windows = buildWindows(segments);
  if (!windows.length) throw new Error("The transcript is empty: no speech was detected in this video.");
  const vectors = await embed(
    windows.map((w) => w.text),
    "RETRIEVAL_DOCUMENT",
  );
  await ctx.db.from("recap_windows").delete().eq("recap_id", ctx.recap.id);
  const rows = windows.map((w, i) => ({
    recap_id: ctx.recap.id,
    idx: w.idx,
    start_sec: w.start,
    end_sec: w.end,
    text: w.text,
    embedding: toPgVector(vectors[i]),
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await ctx.db.from("recap_windows").insert(rows.slice(i, i + 200));
    if (error) throw new Error(`Could not save transcript index: ${error.message}`);
  }
  return {
    trace: [
      ...ctx.recap.trace,
      trace("Indexer", "embedding", t0, `Split ${segments.length} segments into ${windows.length} windows and embedded them (768-d)`, env.geminiEmbedModel()),
    ],
  };
}

async function structure(ctx: Ctx): Promise<Update> {
  const t0 = Date.now();
  const windows = await loadWindows(ctx);
  const duration = ctx.recap.duration_sec ?? windows[windows.length - 1]?.end ?? 0;
  const ranges = detectChapters(
    windows.map((w) => w.embedding),
    { starts: windows.map((w) => w.start), duration },
  );
  const draft = ranges.map((r, index) => ({
    index,
    start: windows[r.from].start,
    end: windows[r.to].end,
    text: windows
      .slice(r.from, r.to + 1)
      .map((w) => w.text)
      .join(" "),
    windowIds: windows.slice(r.from, r.to + 1).map((w) => w.idx),
  }));
  const res = await scout({ chapters: draft, lang: lang(ctx.recap) });
  const chapters: Chapter[] = draft.map((d, i) => ({
    index: d.index,
    start: d.start,
    end: d.end,
    windowIds: d.windowIds,
    title: res.chapters[i].title,
    summary: res.chapters[i].summary,
  }));
  const update: Update = {
    chapters,
    trace: [
      ...ctx.recap.trace,
      trace("Scout", "structuring", t0, `Found ${chapters.length} chapters with embedding TextTiling, then titled and summarised them`, res.model),
    ],
  };
  if (res.title && (ctx.recap.source_type === "youtube" || /\.[a-z0-9]{2,4}$/i.test(ctx.recap.title))) update.title = res.title;
  return update;
}

async function analyze(ctx: Ctx): Promise<Update> {
  const t0 = Date.now();
  const windows = await loadWindows(ctx);
  const chapters = ctx.recap.chapters ?? [];
  const focusVec = ctx.recap.focus ? (await embed([ctx.recap.focus], "RETRIEVAL_QUERY"))[0] : undefined;
  const duration = ctx.recap.duration_sec ?? 0;
  const k = Math.min(10, Math.max(4, Math.round(duration / 360) + 3));
  const ranges = chapters.map((c) => ({ from: c.windowIds[0], to: c.windowIds[c.windowIds.length - 1] }));
  const picks = pickKeyMoments(
    windows.map((w) => w.embedding),
    ranges,
    k,
    focusVec,
  );
  const res = await analyst({
    chapters,
    moments: picks.map((p) => ({ windowId: p.windowId, start: windows[p.windowId].start, text: windows[p.windowId].text })),
    focus: ctx.recap.focus,
    lang: lang(ctx.recap),
  });
  const explained = new Map(res.moments.map((m) => [m.windowId, m]));
  const key_moments: KeyMoment[] = picks.map((p) => {
    const w = windows[p.windowId];
    const m = explained.get(p.windowId);
    return { windowId: p.windowId, start: w.start, end: w.end, quote: m?.quote || w.text.slice(0, 180), why: m?.why ?? "", score: p.score };
  });
  const concepts: Concept[] = res.concepts
    .filter((c) => c.term && c.definition)
    .map((c) => ({ term: c.term, definition: c.definition, start: windows[c.windowId]?.start ?? 0 }));
  return {
    key_moments,
    concepts,
    trace: [
      ...ctx.recap.trace,
      trace(
        "Analyst",
        "analyzing",
        t0,
        `Picked ${key_moments.length} key moments with MMR (relevance vs. diversity${focusVec ? ", biased to your focus" : ""}) and extracted ${concepts.length} concepts`,
        res.model,
      ),
    ],
  };
}

async function write(ctx: Ctx): Promise<Update> {
  const t0 = Date.now();
  let focusPassages: { start: number; text: string }[] = [];
  if (ctx.recap.focus) {
    const windows = await loadWindows(ctx);
    const q = (await embed([ctx.recap.focus], "RETRIEVAL_QUERY"))[0];
    focusPassages = topK(
      q,
      windows.map((w) => w.embedding),
      8,
    )
      .map((h) => windows[h.index])
      .sort((a, b) => a.start - b.start)
      .map((w) => ({ start: w.start, text: w.text }));
  }
  const res = await writer({
    mode: ctx.recap.mode,
    focus: ctx.recap.focus,
    chapters: ctx.recap.chapters ?? [],
    moments: ctx.recap.key_moments ?? [],
    concepts: ctx.recap.concepts ?? [],
    focusPassages,
    lang: lang(ctx.recap),
  });
  if (!res.sections.length) throw new Error("The Writer returned an empty summary; retry this step.");
  const summary: Summary = {
    tldr: res.tldr,
    sections: res.sections.map((s, si) => ({
      heading: s.heading,
      claims: s.claims.map((text, ci) => ({ id: `s${si}c${ci}`, text })),
    })),
  };
  const nClaims = summary.sections.reduce((n, s) => n + s.claims.length, 0);
  return {
    summary,
    trace: [
      ...ctx.recap.trace,
      trace("Writer", "writing", t0, `Drafted ${summary.sections.length} sections / ${nClaims} checkable claims${focusPassages.length ? " using focus retrieval" : ""}`, res.model),
    ],
  };
}

const score = (verdicts: Verdict[]) =>
  verdicts.length ? verdicts.reduce((s, v) => s + (v === "supported" ? 1 : v === "partial" ? 0.5 : 0), 0) / verdicts.length : 1;

async function runInBatches<T, R>(items: T[], size: number, parallel: number, fn: (batch: T[]) => Promise<R>): Promise<R[]> {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  const out: R[] = [];
  for (let i = 0; i < batches.length; i += parallel) out.push(...(await Promise.all(batches.slice(i, i + parallel).map(fn))));
  return out;
}

async function verify(ctx: Ctx): Promise<Update> {
  const t0 = Date.now();
  const summary = structuredClone(ctx.recap.summary) as Summary;
  const windows = await loadWindows(ctx);
  const matrix = windows.map((w) => w.embedding);
  const claims: Claim[] = summary.sections.flatMap((s) => s.claims);

  // 1. retrieve the 3 transcript windows closest to each claim
  const evidenceFor = async (cs: Claim[]) => {
    const vecs = await embed(
      cs.map((c) => c.text),
      "RETRIEVAL_QUERY",
    );
    return new Map(cs.map((c, i) => [c.id, topK(vecs[i], matrix, 3).map((h) => windows[h.index])]));
  };
  const evidence = await evidenceFor(claims);

  // 2. judge every claim (batches of 8, 3 batches at a time)
  const judge = async (cs: Claim[]) => {
    const results = await runInBatches(cs, 8, 3, (batch) =>
      verifier(batch.map((c) => ({ id: c.id, text: c.text, evidence: evidence.get(c.id) ?? [] }))),
    );
    const merged = new Map<string, { verdict: Verdict; evidenceWindowId: number }>();
    results.forEach((r) => r.results.forEach((v, k) => merged.set(k, v)));
    return { merged, model: results[0]?.model };
  };
  const first = await judge(claims);
  const apply = (c: Claim, r?: { verdict: Verdict; evidenceWindowId: number }) => {
    const best = evidence.get(c.id)?.[0];
    const wid = r && r.evidenceWindowId >= 0 && windows[r.evidenceWindowId] ? r.evidenceWindowId : best?.idx;
    c.verdict = r?.verdict ?? "unsupported";
    c.evidenceWindowId = wid;
    c.evidenceStart = wid !== undefined ? windows[wid]?.start : undefined;
  };
  claims.forEach((c) => apply(c, first.merged.get(c.id)));
  const before = score(claims.map((c) => c.verdict as Verdict));

  // 3. self-correction: the Writer rewrites rejected claims from their evidence, then we check again
  const rejected = claims.filter((c) => c.verdict !== "supported");
  let revised = 0;
  let reviserModel: string | undefined;
  if (rejected.length) {
    const fixes = await runInBatches(rejected, 10, 2, (batch) =>
      reviser(
        batch.map((c) => ({ id: c.id, text: c.text, verdict: c.verdict as Verdict, evidence: evidence.get(c.id) ?? [] })),
        lang(ctx.recap),
      ),
    );
    reviserModel = fixes[0]?.model;
    const revisions = new Map<string, string | null>();
    fixes.forEach((f) => f.revisions.forEach((v, k) => revisions.set(k, v)));

    const dropped = new Set<string>();
    const changed: Claim[] = [];
    for (const c of rejected) {
      if (!revisions.has(c.id)) continue;
      const text = revisions.get(c.id);
      if (text === null) {
        dropped.add(c.id);
      } else if (text && text !== c.text) {
        c.original = c.text;
        c.text = text;
        changed.push(c);
      }
    }
    if (changed.length) {
      const again = await evidenceFor(changed);
      again.forEach((v, k) => evidence.set(k, v));
      const second = await judge(changed);
      changed.forEach((c) => apply(c, second.merged.get(c.id)));
      revised = changed.length;
    }
    for (const s of summary.sections) s.claims = s.claims.filter((c) => !dropped.has(c.id));
    summary.sections = summary.sections.filter((s) => s.claims.length);
  }

  const final = summary.sections.flatMap((s) => s.claims);
  const counts: Record<Verdict, number> = { supported: 0, partial: 0, unsupported: 0 };
  final.forEach((c) => counts[c.verdict ?? "unsupported"]++);
  const verification: Verification = { before, after: score(final.map((c) => c.verdict as Verdict)), counts, revised };

  return {
    summary,
    verification,
    trace: [
      ...ctx.recap.trace,
      trace(
        "Verifier",
        "verifying",
        t0,
        `Checked ${claims.length} claims against retrieved transcript evidence: faithfulness ${Math.round(before * 100)}% → ${Math.round(verification.after * 100)}% after ${revised} revision${revised === 1 ? "" : "s"}${reviserModel ? ` (Writer: ${reviserModel})` : ""}`,
        first.model,
      ),
    ],
  };
}

async function study(ctx: Ctx): Promise<Update> {
  const t0 = Date.now();
  const res = await tutor({
    chapters: ctx.recap.chapters ?? [],
    concepts: ctx.recap.concepts ?? [],
    moments: ctx.recap.key_moments ?? [],
    mode: ctx.recap.mode,
    lang: lang(ctx.recap),
  });
  return {
    flashcards: res.flashcards,
    quiz: res.quiz,
    trace: [...ctx.recap.trace, trace("Tutor", "studying", t0, `Created ${res.flashcards.length} flashcards and a ${res.quiz.length}-question quiz`, res.model)],
  };
}

const HANDLERS: Record<keyof typeof NEXT, (ctx: Ctx) => Promise<Update>> = {
  embedding: indexTranscript,
  structuring: structure,
  analyzing: analyze,
  writing: write,
  verifying: verify,
  studying: study,
};

export function isRunnable(status: string): status is keyof typeof NEXT {
  return status in NEXT;
}

/** Runs the recap's current stage and returns what to save (including the next status). */
export async function runStage(db: SupabaseClient, recap: Recap): Promise<Update> {
  if (!isRunnable(recap.status)) throw new Error(`Nothing to run in status "${recap.status}"`);
  const update = await HANDLERS[recap.status]({ db, recap });
  return { ...update, status: NEXT[recap.status], error: null };
}
