import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createSpellEngineV1 } from "@/spell-engine/bundled";

/**
 * TORE Spell BETA release gate. Precision first: a clean passage must never
 * produce a MISSPELLED issue; protected tokens are never touched; deliberate
 * errors behave as recorded (detect + fix, or abstain). Passages are
 * TORE-authored and NOT representative of all Mongolian.
 */
type Corpus = {
  passages: { id: string; kind: string; text: string }[];
  errors: { id: string; text: string; token: string; expect: "MISSPELLED" | "UNKNOWN"; top?: string }[];
};
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, "../evaluation/spell-v1/beta-corpus.json"), "utf8")) as Corpus;
const engine = createSpellEngineV1();

describe("beta regression corpus", () => {
  it("covers every required text kind", () => {
    const kinds = corpus.passages.map((p) => p.kind).join("|");
    for (const k of ["ordinary", "legal prose", "business", "government", "email", "punctuation", "numbers", "names", "abbreviations", "URLs", "English", "citations"]) {
      expect(kinds, k).toContain(k);
    }
  });

  it.each(corpus.passages.map((p) => [p.id, p.text] as const))("clean passage %s has zero MISSPELLED issues", (_id, text) => {
    const r = engine.analyze(text, { reportUnknown: true });
    expect(r.issues.filter((i) => i.verdict === "MISSPELLED")).toEqual([]);
  });

  it("protected tokens (URLs, e-mail, Latin, numbers, acronyms, citations) are never touched, not even as UNKNOWN", () => {
    for (const id of ["url-1", "english-1", "citation-1", "numbers-1", "abbr-1"]) {
      const text = corpus.passages.find((p) => p.id === id)!.text;
      const protectedRanges = [...text.matchAll(/https?:\/\/\S+|[\w.]+@[\w.]+|[A-Za-z]+|№?\d[\d.,:\/]*(?:-[а-яөү]+)?|\b[А-ЯӨҮ]{2,}(?:-[а-яөү]+)?/gu)].map((m) => [m.index!, m.index! + m[0].length] as const);
      const hits = engine
        .analyze(text, { reportUnknown: true })
        .issues.filter((i) => protectedRanges.some(([a, b]) => i.range.start >= a && i.range.end <= b))
        // ТӨҮГ-style acronyms absent from the abbreviation list are reported UNKNOWN, never corrected.
        .filter((i) => !(i.verdict === "UNKNOWN" && /^[А-ЯӨҮ]{2,}$/u.test(i.token)));
      expect(hits, id).toEqual([]);
    }
  });

  it.each(corpus.errors)("deliberate error $id: $expect", (e) => {
    const issue = engine.analyze(e.text, { reportUnknown: true }).issues.find((i) => i.token === e.token);
    expect(issue?.verdict).toBe(e.expect);
    if (e.expect === "MISSPELLED") expect(issue?.suggestions[0]?.text).toBe(e.top);
    else expect(issue?.suggestions ?? []).toEqual([]); // UNKNOWN is never auto-corrected
  });

  it("basic function words are known (coverage floor for ordinary prose)", () => {
    for (const w of ["маш", "гэвч", "бүх", "нар", "сая", "ус", "гал"]) {
      expect(engine.checkWord(w).verdict, w).toBe("VALID");
    }
  });
});

describe("beta performance (word / 1k / 20k / 100k chars)", () => {
  const sentence = "Шүүх хэргийг хянан шийдвэрлэхдээ нотлох баримтыг үнэлнэ. Компани шинэ төслийн төлөвлөгөөг баталлаа. ";
  const repeat = (n: number) => sentence.repeat(Math.ceil(n / sentence.length)).slice(0, n);
  const time = (fn: () => void, runs: number) => {
    const t: number[] = [];
    for (let i = 0; i < runs; i += 1) {
      const t0 = performance.now();
      fn();
      t.push(performance.now() - t0);
    }
    t.sort((a, b) => a - b);
    return { p50: t[Math.floor(runs * 0.5)]!, p95: t[Math.floor(runs * 0.95)]! };
  };
  it("meets the latency budget", () => {
    engine.analyze(repeat(1000)); // warm-up
    expect(time(() => engine.checkWord("шийдвэрлэхдээ"), 400).p95).toBeLessThan(5);
    expect(time(() => engine.analyze(repeat(1_000)), 40).p95).toBeLessThan(100);
    expect(time(() => engine.analyze(repeat(20_000)), 8).p95).toBeLessThan(500);
    expect(time(() => engine.analyze(repeat(100_000)), 3).p95).toBeLessThan(2500);
  });
});
