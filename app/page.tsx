import Link from "next/link";

const AGENTS = [
  ["Transcriber", "Audio is extracted in your browser and transcribed with Whisper; YouTube videos are read directly."],
  ["Indexer", "The transcript is cut into ~40 s windows and embedded into a vector index."],
  ["Scout", "Topic shifts are detected with embedding TextTiling to build chapters, then each is titled."],
  ["Analyst", "Key moments are picked with MMR (relevant but diverse) and core concepts are extracted."],
  ["Writer", "Writes the summary for your goal: overview, study notes, exam revision or meeting minutes."],
  ["Verifier", "Fact-checks every claim against retrieved transcript evidence and has the Writer fix what fails."],
  ["Tutor", "Turns the material into flashcards and a quiz, each linked to its chapter."],
];

export default function Home() {
  const sample = process.env.NEXT_PUBLIC_SAMPLE_RECAP_ID;
  return (
    <div className="stack">
      <section style={{ padding: "30px 0" }}>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.4rem)", margin: 0 }}>Summaries you can trust, linked to the second it was said.</h1>
        <p className="muted" style={{ fontSize: "1.15rem", maxWidth: 720 }}>
          Recap turns lectures, talks and YouTube videos into chapters, fact-checked summaries, flashcards and quizzes. Seven AI agents do the
          work, and every claim shows its evidence and its timestamp.
        </p>
        <div className="row">
          <Link className="btn primary" href="/app/new">
            Recap a video
          </Link>
          {sample && (
            <Link className="btn" href={`/r/${sample}`}>
              See a sample
            </Link>
          )}
        </div>
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>How it works</h2>
        <ol className="stack">
          {AGENTS.map(([name, text]) => (
            <li key={name}>
              <b>{name}</b>: <span className="muted">{text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Pricing</h2>
        <div className="grid2">
          <div>
            <h3>Free</h3>
            <p className="muted">3 recaps per day, videos up to 60 minutes, all features.</p>
          </div>
          <div>
            <h3>Pro (coming soon)</h3>
            <p className="muted">Longer videos, unlimited recaps, exports to Notion and Anki.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
