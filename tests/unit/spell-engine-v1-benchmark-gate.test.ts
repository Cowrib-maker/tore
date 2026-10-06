import { describe, expect, it } from "vitest";
import { EXPECTATION_CHANGES, GOLD_CASES } from "../evaluation/spell-v1/gold-adapter";
import { bundledEngine, runBenchmark } from "../evaluation/spell-v1/run-benchmark";

/**
 * PRECISION GATES. These fail the build if the engine starts accusing
 * correct text. Recall targets are deliberately modest while the lexicon is a
 * SEED pack; precision targets are not negotiable.
 */
const engine = bundledEngine();
const report = runBenchmark(engine, { samples: 1500 });

describe("precision gates (bundled SEED packs)", () => {
  it("zero MISSPELLED on clean text", () => {
    expect(report.clean.fpWords).toEqual([]);
    expect(report.clean.fpPer1000Words).toBe(0);
  });
  it("never accuses a valid paradigm form or a protected token", () => {
    expect(report.paradigms.falseMisspelled).toBe(0);
    expect(report.paradigms.protectedFlagged).toBe(0);
    expect(report.paradigms.acceptanceRate).toBeGreaterThanOrEqual(0.95);
  });
  it("every flagged paradigm violation has the correct top-1 fix", () => {
    expect(report.paradigms.invalidWrongFix).toEqual([]);
    expect(report.paradigms.invalidFlagged).toBeGreaterThanOrEqual(report.paradigms.invalidForms - 1);
  });
  it("synthetic errors: suggestion precision ≥ 0.99 and top-3 = top-1 hits", () => {
    expect(report.synthetic.suggestionPrecision).toBeGreaterThanOrEqual(0.99);
    expect(report.synthetic.top3).toBeGreaterThanOrEqual(report.synthetic.top1);
    expect(report.synthetic.detectionRate).toBeGreaterThan(0.25);
  });
  it("legacy gold sets: no VALID/LEGAL/UNKNOWN/PROPER_NOUN/ABBREVIATION/REGRESSION case is flagged", () => {
    for (const cls of ["VALID", "LEGAL", "UNKNOWN", "PROPER_NOUN", "ABBREVIATION", "REGRESSION"]) {
      const b = report.gold[cls]!;
      expect(b.failures, cls).toEqual([]);
      expect(b.ok).toBe(b.total);
    }
  });
  it("legacy gold set MISSPELLING: never a WRONG fix (abstaining is allowed)", () => {
    const wrong = GOLD_CASES.filter((c) => c.cls === "MISSPELLING").flatMap((c) => {
      const a = engine.checkWord(c.input);
      return a.verdict === "MISSPELLED" && a.issue?.suggestions[0]?.text !== c.expected ? [`${c.input}→${a.issue?.suggestions[0]?.text}`] : [];
    });
    expect(wrong).toEqual([]);
    expect(report.gold.MISSPELLING!.ok).toBeGreaterThanOrEqual(8);
  });
  it("dangerous near-neighbour pairs are never flagged", () => {
    expect(report.dangerous.list).toEqual([]);
  });
  it("UNKNOWN never carries a suggestion", () => {
    const r = engine.analyze("захирамж яллагдагч сэжигтэн жиппоюкс зхшхштх", { reportUnknown: true });
    for (const i of r.issues) expect(i.suggestions).toEqual([]);
  });
  it("documented expectation changes are actually met", () => {
    expect(engine.checkWord("хэрэгг").verdict).toBe("MISSPELLED");
    expect(engine.checkWord("ажилээс").verdict).not.toBe("MISSPELLED"); // lenient MIXED-harmony stem, never accused
    expect(EXPECTATION_CHANGES.length).toBeGreaterThan(0);
  });
});

describe("M1 verb gates", () => {
  it("TORE verb gold: ≥ 98 % accepted, none accused, no invalid form VALID", () => {
    const g = report.verbGold;
    expect(g.acceptance).toBeGreaterThanOrEqual(0.98);
    expect(g.falseMisspelled).toBe(0);
    expect(g.invalidAsValid).toEqual([]);
  });
});

describe("M1.1 gates: regression, mutation, provenance", () => {
  it("regression cases hold", () => {
    expect(report.regression.failures).toEqual([]);
  });
  it("seeded negative mutations: no unadjudicated mutant is VALID, no wrong repair", () => {
    expect(report.mutation.suspects).toBe(0);
    expect(report.mutation.wrongRepairs).toBe(0);
    expect(report.mutation.mutated).toBeGreaterThan(1000);
  });
  it("the verb gold draft is labelled honestly: no record claims native review", () => {
    expect(report.verbGold.nativeReviewedRecords).toBe(0);
  });
});

describe("performance gates", () => {
  it("word p95 < 5 ms; 20k-char document well under a second", () => {
    expect(report.perf.wordP95Ms).toBeLessThan(5);
    expect(report.perf.doc20kCharsP50Ms).toBeLessThan(500);
  });
});
