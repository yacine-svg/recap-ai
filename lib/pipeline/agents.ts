import { askJSON } from "@/lib/ai/llm";
import { arr, num, obj, str } from "@/lib/ai/json";
import { LANGUAGES, type Chapter, type Concept, type KeyMoment, type Mode, type TranscriptWindow, type Verdict } from "@/lib/types";
import { formatTime, squeeze } from "./text";

/*
 * The agents. Each one has a single job, a strict JSON contract, and only sees
 * what it needs, which keeps prompts small (free-tier friendly) and makes every
 * step inspectable in the recap's trace.
 */

export function languageRule(outputLanguage: string, detected: string) {
  if (outputLanguage !== "auto" && LANGUAGES[outputLanguage]) return `Write everything in ${LANGUAGES[outputLanguage]}.`;
  return `Write everything in the same language as the transcript (detected: ${detected || "unknown"}).`;
}

const at = (sec: number) => `[${formatTime(sec)}]`;

/* ---------------- Scout: names and summarises the chapters ---------------- */

export async function scout(input: {
  chapters: { index: number; start: number; end: number; text: string }[];
  lang: string;
}) {
  const texts = squeeze(
    input.chapters.map((c) => c.text),
    48000,
  );
  const body = input.chapters
    .map((c, i) => `### Chapter ${c.index} ${at(c.start)}–${at(c.end)}\n${texts[i]}`)
    .join("\n\n");
  const { data, model } = await askJSON<unknown>(
    "long",
    `You are the Scout agent of a video summarisation system. The transcript has already been split into chapters by topic-shift detection. For each chapter, write a short specific title (max 8 words, no numbering) and a 1–2 sentence summary of what is actually said. Also give the whole video a short descriptive title. ${input.lang}
Return JSON: {"title": string, "chapters": [{"index": number, "title": string, "summary": string}]}`,
    body,
  );
  const d = obj(data);
  const byIndex = new Map(arr(d.chapters).map((c) => [num(obj(c).index, -1), obj(c)]));
  return {
    model,
    title: str(d.title),
    chapters: input.chapters.map((c) => {
      const o = byIndex.get(c.index) ?? {};
      return { index: c.index, title: str(o.title, `Part ${c.index + 1}`), summary: str(o.summary) };
    }),
  };
}

/* ---------------- Analyst: explains key moments, extracts concepts ---------------- */

export async function analyst(input: {
  chapters: Chapter[];
  moments: { windowId: number; start: number; text: string }[];
  focus: string | null;
  lang: string;
}) {
  const outline = input.chapters.map((c) => `- ${at(c.start)} ${c.title}: ${c.summary}`).join("\n");
  const moments = input.moments.map((m) => `<moment windowId="${m.windowId}" time="${formatTime(m.start)}">\n${m.text}\n</moment>`).join("\n");
  const { data, model } = await askJSON<unknown>(
    "long",
    `You are the Analyst agent. You receive the outline of a video and its most representative passages (selected by embedding centrality and diversity). For each passage: quote its most important sentence word for word (max 30 words, original language) and explain in one sentence why it matters. Then list the key concepts the video defines or relies on (max 12), each with a one-sentence definition grounded in the passages, and the windowId where it appears. ${input.focus ? `The viewer specifically wants: "${input.focus}". Favour what serves that.` : ""} ${input.lang}
Return JSON: {"moments": [{"windowId": number, "quote": string, "why": string}], "concepts": [{"term": string, "definition": string, "windowId": number}]}`,
    `OUTLINE\n${outline}\n\nPASSAGES\n${moments}`,
  );
  const d = obj(data);
  return {
    model,
    moments: arr(d.moments).map((m) => {
      const o = obj(m);
      return { windowId: num(o.windowId, -1), quote: str(o.quote), why: str(o.why) };
    }),
    concepts: arr(d.concepts).map((c) => {
      const o = obj(c);
      return { term: str(o.term), definition: str(o.definition), windowId: num(o.windowId, -1) };
    }),
  };
}

/* ---------------- Writer: the summary, adapted to the viewer's need ---------------- */

const MODE_RULES: Record<Mode, string> = {
  overview: "A quick overview: 3 to 5 sections, 2 to 4 claims each, only the essentials.",
  study:
    "Study notes: one section per main topic, 3 to 6 claims each, including definitions, steps, examples and the reasoning the speaker gives.",
  exam:
    'Exam revision: sections such as "Must know", "Definitions & formulas", "Likely exam questions" (phrase claims as question + answer), "Common mistakes". Only include what the video supports.',
  meeting:
    'Meeting minutes: sections "Decisions", "Action items" (who does what, if said), "Open questions", "Key discussion points".',
};

export async function writer(input: {
  mode: Mode;
  focus: string | null;
  chapters: Chapter[];
  moments: KeyMoment[];
  concepts: Concept[];
  focusPassages: { start: number; text: string }[];
  lang: string;
}) {
  const ctx = [
    "CHAPTERS",
    ...input.chapters.map((c) => `- ${at(c.start)} ${c.title}: ${c.summary}`),
    "",
    "KEY MOMENTS",
    ...input.moments.map((m) => `- ${at(m.start)} "${m.quote}" (${m.why})`),
    "",
    "CONCEPTS",
    ...input.concepts.map((c) => `- ${c.term}: ${c.definition}`),
  ];
  if (input.focusPassages.length) {
    ctx.push("", "PASSAGES MOST RELEVANT TO THE VIEWER'S QUESTION");
    ctx.push(...squeeze(input.focusPassages.map((p) => `${at(p.start)} ${p.text}`), 16000));
  }
  const { data, model } = await askJSON<unknown>(
    "long",
    `You are the Writer agent. Write a summary of a video from the material prepared by the other agents. ${MODE_RULES[input.mode]}
${input.focus ? `The viewer's goal: "${input.focus}". Put what answers it first.` : ""}
Rules: every claim is ONE self-contained sentence that can be checked against the transcript; never add facts, numbers or opinions that are not in the material; no filler like "the speaker talks about". ${input.lang}
Return JSON: {"tldr": "2-3 sentences", "sections": [{"heading": string, "claims": [string]}]}`,
    ctx.join("\n"),
    0.3,
  );
  const d = obj(data);
  return {
    model,
    tldr: str(d.tldr),
    sections: arr(d.sections)
      .map((s) => {
        const o = obj(s);
        return { heading: str(o.heading), claims: arr(o.claims).map((c) => str(c)).filter(Boolean) };
      })
      .filter((s) => s.claims.length),
  };
}

/* ---------------- Verifier: checks each claim against the transcript ---------------- */

export async function verifier(
  items: { id: string; text: string; evidence: TranscriptWindow[] }[],
): Promise<{ model: string; results: Map<string, { verdict: Verdict; evidenceWindowId: number }> }> {
  const body = items
    .map(
      (it) =>
        `<claim id="${it.id}">${it.text}</claim>\n${it.evidence
          .map((w) => `<evidence windowId="${w.idx}" time="${formatTime(w.start)}">${w.text}</evidence>`)
          .join("\n")}`,
    )
    .join("\n\n");
  const { data, model } = await askJSON<unknown>(
    "fast",
    `You are the Verifier agent, a strict fact checker. For each claim, decide using ONLY its evidence passages from the transcript:
- "supported": the evidence clearly states or directly implies it,
- "partial": part of it is supported but something is missing, stronger or different,
- "unsupported": the evidence does not say it (even if it is true in general).
Give the windowId of the passage that best supports the claim (or the closest one).
Return JSON: {"results": [{"id": string, "verdict": "supported" | "partial" | "unsupported", "windowId": number}]}`,
    body,
    0,
  );
  const results = new Map<string, { verdict: Verdict; evidenceWindowId: number }>();
  for (const r of arr(obj(data).results)) {
    const o = obj(r);
    const v = str(o.verdict) as Verdict;
    results.set(str(o.id), {
      verdict: v === "supported" || v === "partial" || v === "unsupported" ? v : "unsupported",
      evidenceWindowId: num(o.windowId, -1),
    });
  }
  return { model, results };
}

/** Writer, second pass: rewrites the claims the Verifier rejected, from the evidence only. */
export async function reviser(items: { id: string; text: string; verdict: Verdict; evidence: TranscriptWindow[] }[], lang: string) {
  const body = items
    .map(
      (it) =>
        `<claim id="${it.id}" verdict="${it.verdict}">${it.text}</claim>\n${it.evidence.map((w) => `<evidence>${w.text}</evidence>`).join("\n")}`,
    )
    .join("\n\n");
  const { data, model } = await askJSON<unknown>(
    "fast",
    `You are the Writer agent fixing claims a fact checker rejected. Rewrite each claim so that it is fully supported by its evidence passages: keep the useful idea, remove or correct what the evidence does not say. If nothing useful can be said from the evidence, return null for that claim. One sentence per claim. ${lang}
Return JSON: {"revisions": [{"id": string, "text": string | null}]}`,
    body,
    0.2,
  );
  const out = new Map<string, string | null>();
  for (const r of arr(obj(data).revisions)) {
    const o = obj(r);
    out.set(str(o.id), typeof o.text === "string" && o.text.trim() ? o.text.trim() : null);
  }
  return { model, revisions: out };
}

/* ---------------- Tutor: flashcards and quiz ---------------- */

export async function tutor(input: { chapters: Chapter[]; concepts: Concept[]; moments: KeyMoment[]; mode: Mode; lang: string }) {
  const n = Math.min(15, Math.max(6, input.chapters.length * 2));
  const ctx = [
    ...input.chapters.map((c) => `Chapter ${c.index} ${at(c.start)} ${c.title}: ${c.summary}`),
    "",
    ...input.concepts.map((c) => `Concept: ${c.term}: ${c.definition}`),
    "",
    ...input.moments.map((m) => `Quote ${at(m.start)}: "${m.quote}"`),
  ].join("\n");
  const { data, model } = await askJSON<unknown>(
    "fast",
    `You are the Tutor agent. From the material below, create ${n} flashcards and ${Math.min(10, n)} multiple-choice questions that test understanding (not trivia like "what time was X said"). Each question has exactly 4 options, one correct, with plausible distractors and a one-sentence explanation. Link each item to the chapter it comes from. Only use facts present in the material. ${input.lang}
Return JSON: {"flashcards": [{"front": string, "back": string, "chapter": number}], "quiz": [{"question": string, "options": [string, string, string, string], "answer": 0-3, "explanation": string, "chapter": number}]}`,
    ctx,
    0.4,
  );
  const d = obj(data);
  const startOf = (ch: number) => input.chapters.find((c) => c.index === ch)?.start ?? 0;
  return {
    model,
    flashcards: arr(d.flashcards)
      .map((f) => {
        const o = obj(f);
        return { front: str(o.front), back: str(o.back), start: startOf(num(o.chapter)) };
      })
      .filter((f) => f.front && f.back),
    quiz: arr(d.quiz)
      .map((q) => {
        const o = obj(q);
        const options = arr(o.options).map((x) => str(x)).filter(Boolean);
        const answer = Math.round(num(o.answer, -1));
        return { question: str(o.question), options, answer, explanation: str(o.explanation), start: startOf(num(o.chapter)) };
      })
      .filter((q) => q.question && q.options.length === 4 && q.answer >= 0 && q.answer < 4),
  };
}
