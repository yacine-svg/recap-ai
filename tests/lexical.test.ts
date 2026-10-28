import { describe, expect, test } from "bun:test";
import { detectChapters } from "../lib/pipeline/segment";
import { LexicalIndex, tokenize } from "../lib/pipeline/lexical";
import { cosine, topK } from "../lib/pipeline/vector";

describe("local TF-IDF vectors", () => {
  test("tokenizer drops stopwords, accents and Arabic diacritics", () => {
    expect(tokenize("The Réseau de neurones, et la rétro-propagation!")).toEqual(["reseau", "neurones", "retro", "propagation"]);
    expect(tokenize("الشَّبَكَة")).toEqual(["الشبكة"]);
  });

  test("vectors are unit length and 768-d", () => {
    const idx = new LexicalIndex(["gradient descent", "neural networks"]);
    const v = idx.vector("gradient descent step");
    expect(v.length).toBe(768);
    expect(Math.sqrt(v.reduce((s, x) => s + x * x, 0))).toBeCloseTo(1);
  });

  test("retrieves the passage a claim paraphrases", () => {
    const docs = [
      "Today we start with linear regression and the least squares loss.",
      "Backpropagation applies the chain rule to compute the gradient of the loss with respect to every weight.",
      "Convolutional networks share weights across positions of the image.",
      "To finish, the exam will cover regularisation and dropout.",
    ];
    const idx = new LexicalIndex(docs);
    const claim = idx.vector("Backpropagation uses the chain rule to get gradients for each weight.");
    expect(topK(claim, idx.vectors(docs), 1)[0].index).toBe(1);
  });

  test("lexical TextTiling separates two topics", () => {
    const a = "neural network layer weights activation gradient training";
    const b = "medieval castle king siege army fortress knights";
    const docs = [...Array(8).fill(a), ...Array(8).fill(b)].map((d, i) => `${d} example ${i}`);
    const idx = new LexicalIndex(docs);
    const emb = idx.vectors(docs);
    expect(cosine(emb[0], emb[1])).toBeGreaterThan(cosine(emb[0], emb[12]));
    const ch = detectChapters(emb, { starts: docs.map((_, i) => i * 40), duration: 640, maxChapters: 4, minChapterSec: 120 });
    expect(ch.map((c) => c.from)).toContain(8);
  });
});
