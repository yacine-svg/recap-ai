import { EMBED_DIM } from "@/lib/env";

/*
 * Local text vectors, no API needed: TF-IDF over the transcript's own windows,
 * projected to a fixed 768 dimensions with the signed "hashing trick"
 * (Weinberger et al., 2009). Unigrams + bigrams, sublinear term frequency,
 * smoothed IDF, L2-normalised, so cosine similarity = TF-IDF cosine.
 *
 * Lexical cohesion is exactly what the original TextTiling measured, and
 * TF-IDF is a strong retriever for fact checking a claim against the passage
 * it paraphrases. When a neural embedding API is available, Recap uses that
 * instead (see EMBEDDINGS_PROVIDER).
 */

const STOP = new Set(
  (
    "the a an and or but if then of to in on at by for with from as is are was were be been being it its this that these those " +
    "i you he she we they me him her us them my your our their there here what which who whom how why when where so not no yes do does did " +
    "have has had can could will would should may might must just very also about into over than too more most such only own same other " +
    "le la les un une des du de et ou mais si alors à au aux en dans sur par pour avec sans est sont était être été ce cet cette ces " +
    "il elle on nous vous ils elles je tu me te se mon ton son ma ta sa mes tes ses notre votre leur leurs qui que quoi dont où ne pas plus " +
    "y a ai as avons avez ont fait faire comme donc car très aussi bien tout tous toute toutes " +
    "el los las y o pero que es son de del al con por para una uno " +
    "في من على إلى عن أن إن كان كانت هذا هذه ذلك التي الذي ما لا لم هو هي هم و أو ثم مع كل قد"
  ).split(/\s+/),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "") // accents and Arabic diacritics
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function terms(text: string): string[] {
  const toks = tokenize(text);
  const out = toks.slice();
  for (let i = 0; i < toks.length - 1; i++) out.push(`${toks[i]}_${toks[i + 1]}`);
  return out;
}

/** FNV-1a 32-bit hash. */
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class LexicalIndex {
  private idf = new Map<string, number>();
  private readonly n: number;

  constructor(docs: string[]) {
    this.n = docs.length;
    const df = new Map<string, number>();
    for (const d of docs) for (const t of new Set(terms(d))) df.set(t, (df.get(t) ?? 0) + 1);
    for (const [t, f] of df) this.idf.set(t, Math.log((this.n + 1) / (f + 1)) + 1);
  }

  vector(text: string): number[] {
    const tf = new Map<string, number>();
    for (const t of terms(text)) tf.set(t, (tf.get(t) ?? 0) + 1);
    const v = new Array<number>(EMBED_DIM).fill(0);
    const unseen = Math.log(this.n + 1) + 1; // a query word absent from the transcript
    for (const [t, f] of tf) {
      const h = fnv(t);
      const sign = h & 0x80000000 ? -1 : 1;
      v[h % EMBED_DIM] += sign * (1 + Math.log(f)) * (this.idf.get(t) ?? unseen);
    }
    let norm = 0;
    for (const x of v) norm += x * x;
    norm = Math.sqrt(norm);
    return norm ? v.map((x) => x / norm) : v;
  }

  vectors(texts: string[]): number[][] {
    return texts.map((t) => this.vector(t));
  }
}
