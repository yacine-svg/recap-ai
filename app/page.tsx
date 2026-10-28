import Link from "next/link";
import ElasticHeadline from "@/components/fx/ElasticHeadline";
import Magnetic from "@/components/fx/Magnetic";
import Scramble from "@/components/fx/Scramble";
import ShaderBg from "@/components/fx/ShaderBg";
import UnicornScene from "@/components/fx/UnicornScene";
import AgentScroll from "@/components/landing/AgentScroll";
import TapeDemo from "@/components/landing/TapeDemo";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { MODE_LABELS } from "@/lib/types";

const MODE_DETAIL: Record<string, string> = {
  overview: "The essentials of a talk in a few minutes of reading, for deciding whether to watch it.",
  study: "Structured notes per topic, with the definitions, steps and examples the speaker gives.",
  exam: "What you must know, likely exam questions with their answers, and the mistakes to avoid.",
  meeting: "Decisions, who does what, and the questions left open.",
};

const FAQ = [
  [
    "Does my video get uploaded?",
    "No. For a file, Recap extracts the sound in your browser and sends only short pieces of audio to be transcribed. The video itself stays on your device. For YouTube, Recap reads the video's captions.",
  ],
  [
    "How do I know the notes are right?",
    "Every sentence is checked against the passages of the transcript it came from, and marked verified, partly verified or not found. Click its timestamp to hear the speaker say it.",
  ],
  [
    "Which languages work?",
    "Videos in most languages, including English, French and Arabic. Notes can be written in the video's language or translated to another one.",
  ],
  ["Which videos work best?", "Talks with one main speaker: lectures, tutorials, conference talks, meetings. Public YouTube videos need captions; most lectures have them."],
  ["Is it free?", `Yes. The free plan includes ${env.dailyLimit()} recaps a day, for videos up to ${env.maxMinutes()} minutes.`],
];

export default async function Home() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const start = user ? "/app/new" : "/login?mode=signup";
  const sample = process.env.NEXT_PUBLIC_SAMPLE_RECAP_ID;

  return (
    <>
      <section className="hero">
        <ShaderBg />
        <div className="hero-grid">
          <div>
            <ElasticHeadline lines={["Two-hour lecture.", "Ten-minute notes.", "Every line checked."]} />
            <p className="lede">
              Recap turns a lecture or a YouTube video into chapters, notes for your goal, flashcards and a quiz. Then it checks each sentence
              against the transcript and links it to the second it was said.
            </p>
            <div className="row">
              <Magnetic>
                <Link className="btn primary" href={start} style={{ minHeight: 54, padding: "0 28px", fontSize: "1.05rem" }}>
                  Recap a video
                </Link>
              </Magnetic>
              {sample ? (
                <Link className="btn" href={`/r/${sample}`}>
                  See a real recap
                </Link>
              ) : (
                <a className="btn" href="#how">
                  How it works
                </a>
              )}
            </div>
          </div>
          <TapeDemo />
        </div>
      </section>

      <section className="sec" id="how">
        <div className="sec-head">
          <h2>Seven agents, one recap.</h2>
          <p className="lede">Each one does a single job and hands its work to the next. You can watch them work, and every step is recorded in the recap.</p>
        </div>
        <AgentScroll />
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2>Checked, not guessed.</h2>
          <p className="lede">
            AI summaries sound confident even when they are wrong. Recap shows you which sentences the video actually supports.
          </p>
        </div>
        <div className="verify">
          <div className="panel verify-step">
            <h3>A sentence from your notes</h3>
            <p className="quote">Backpropagation computes gradients by applying the chain rule from the output layer backwards.</p>
          </div>
          <div className="panel verify-step">
            <h3>What the speaker said</h3>
            <p className="quote muted">
              “…so <mark>backpropagation is the chain rule applied layer by layer</mark>, starting <mark>from the output</mark> and going{" "}
              <mark>back</mark>…”
            </p>
          </div>
          <div className="panel verify-step">
            <h3>The verdict</h3>
            <div className="row">
              <span className="chip verdict-supported">verified</span>
              <span className="chip" data-cursor="▶ 18:22">
                18:22
              </span>
            </div>
            <div className="score" style={{ marginTop: 24 }}>
              <b>98%</b>
              <span className="muted small">
                of this example recap is supported by the video, up from 85% before the Writer fixed the sentences that failed.
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2>Notes for what you need.</h2>
          <p className="lede">Pick a mode, and optionally ask a question. Recap looks for the passages that answer it first.</p>
        </div>
        <div className="modes">
          {Object.entries(MODE_LABELS).map(([k, m]) => (
            <div key={k} className="mode">
              <h3>
                <Scramble text={m.label} />
              </h3>
              <p className="muted">{MODE_DETAIL[k]}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="sec" id="pricing">
        <div className="sec-head">
          <h2>Free while you study.</h2>
        </div>
        <div className="plans">
          <div className="plan main">
            <h3>Free</h3>
            <p className="price">0 DA</p>
            <p className="muted">Everything Recap does, within daily limits.</p>
            <ul>
              <li>{env.dailyLimit()} recaps a day</li>
              <li>Videos up to {env.maxMinutes()} minutes</li>
              <li>Files and YouTube links</li>
              <li>Notes, chapters, flashcards and quiz</li>
              <li>Public share links</li>
            </ul>
            <Link className="btn primary" href={start}>
              Recap a video
            </Link>
          </div>
          <div className="plan">
            <h3>Pro</h3>
            <p className="price">Soon</p>
            <p className="muted">For full courses and long recordings.</p>
            <ul>
              <li>Videos up to 4 hours</li>
              <li>Unlimited recaps</li>
              <li>Export to Anki and Notion</li>
              <li>Recaps across a whole course</li>
            </ul>
            <button type="button" disabled>
              Coming soon
            </button>
          </div>
        </div>
      </section>

      <section className="sec faq">
        <div className="sec-head">
          <h2>Questions</h2>
        </div>
        {FAQ.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </section>

      <section className="closing">
        <UnicornScene className="unicorn" />
        <h2>Your next lecture, recapped.</h2>
        <div className="row">
          <Magnetic>
            <Link className="btn primary" href={start} style={{ minHeight: 58, padding: "0 32px", fontSize: "1.1rem" }}>
              Recap a video
            </Link>
          </Magnetic>
        </div>
      </section>

      <footer className="ft">
        <span>Recap, built by Sekhri Mohammed Yassine</span>
        <span className="row" style={{ gap: 20 }}>
          <a href="https://yassine-sekhri.vercel.app" target="_blank" rel="noopener">
            Portfolio
          </a>
          <a href="https://github.com/yacine-svg/recap-ai" target="_blank" rel="noopener">
            Source on GitHub
          </a>
        </span>
      </footer>
    </>
  );
}
