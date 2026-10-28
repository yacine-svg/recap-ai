/* Shared types between the browser, the API routes and the pipeline. */

export type SourceType = "upload" | "youtube";
export type Mode = "overview" | "study" | "exam" | "meeting";

export const STAGES = ["transcribing", "embedding", "structuring", "analyzing", "writing", "verifying", "studying", "done"] as const;
export type Stage = (typeof STAGES)[number];
export type Status = Stage | "error";

export type Segment = { start: number; end: number; text: string };
export type Transcript = { language: string; segments: Segment[] };

/** ~40 s slice of the transcript, the unit we embed and retrieve. */
export type TranscriptWindow = { idx: number; start: number; end: number; text: string };
export type EmbeddedWindow = TranscriptWindow & { embedding: number[] };

export type Chapter = {
  index: number;
  start: number;
  end: number;
  title: string;
  summary: string;
  windowIds: number[];
};

export type KeyMoment = { windowId: number; start: number; end: number; quote: string; why: string; score: number };
export type Concept = { term: string; definition: string; start: number };

export type Verdict = "supported" | "partial" | "unsupported";
export type Claim = {
  id: string;
  text: string;
  verdict?: Verdict;
  evidenceWindowId?: number;
  evidenceStart?: number;
  /** text before the Verifier asked the Writer to fix it */
  original?: string;
};
export type SummarySection = { heading: string; claims: Claim[] };
export type Summary = { tldr: string; sections: SummarySection[] };

export type Verification = {
  /** faithfulness score (0–1) of the Writer's first draft */
  before: number;
  /** score after the Writer revised the unsupported claims */
  after: number;
  counts: Record<Verdict, number>;
  revised: number;
};

export type Flashcard = { front: string; back: string; start: number };
export type QuizQuestion = { question: string; options: string[]; answer: number; explanation: string; start: number };

export type TraceEntry = {
  agent: "Transcriber" | "Indexer" | "Scout" | "Analyst" | "Writer" | "Verifier" | "Tutor";
  stage: Stage;
  ms: number;
  model?: string;
  note: string;
  at: string;
};

export type Recap = {
  id: string;
  user_id: string;
  title: string;
  source_type: SourceType;
  source_url: string | null;
  duration_sec: number | null;
  mode: Mode;
  focus: string | null;
  output_language: string;
  status: Status;
  error: string | null;
  transcript: Transcript | null;
  chapters: Chapter[] | null;
  key_moments: KeyMoment[] | null;
  concepts: Concept[] | null;
  summary: Summary | null;
  verification: Verification | null;
  flashcards: Flashcard[] | null;
  quiz: QuizQuestion[] | null;
  trace: TraceEntry[];
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

export const MODE_LABELS: Record<Mode, { label: string; hint: string }> = {
  overview: { label: "Quick overview", hint: "The essentials in a few minutes of reading" },
  study: { label: "Study notes", hint: "Structured notes with definitions and examples" },
  exam: { label: "Exam revision", hint: "What you must know, likely questions, pitfalls" },
  meeting: { label: "Meeting minutes", hint: "Decisions, action items and open questions" },
};

export const LANGUAGES: Record<string, string> = {
  auto: "Same as the video",
  en: "English",
  fr: "Français",
  ar: "العربية",
  es: "Español",
  de: "Deutsch",
};
