import { describe, expect, it } from "vitest";
import { createSpellEngineV1 } from "../../src/spell-engine";
import { createSpellEngineV1 as createPhase2 } from "../evaluation/spell-v3/frozen-phase2-2026-10-07/engine/bundled";
import { evaluateLoans, evaluateNames } from "../evaluation/spell-v1/eval-sets";
import { loadAll } from "../evaluation/spell-v3/gold-sets";
import { loadCleanLines, loadParadigms, runBenchmark } from "../evaluation/spell-v1/run-benchmark";

/**
 * PHASE 3 PRECISION GATES (non-negotiable). A coverage improvement that breaks any of these is rejected or redesigned.
 * Each gate states what it protects. All run on the working tree's product configuration AND, where it matters, on the
 * RELEASE-CLAIM configuration (TRUSTED+REVIEWED packs only).
 */
const engine = createSpellEngineV1();
const claim = createSpellEngineV1({ minTier: "TRUSTED" });
const phase2 = createPhase2();
const report = runBenchmark(engine);
const verdict = (e: { analyze(t: string): { tokens: readonly { verdict: string }[] } }, w: string) => e.analyze(`Энэ ${w} нь`).tokens[1]!.verdict;

describe("gate: clean text", () => {
  it("no committed clean sentence is flagged (product and claim configurations)", () => {
    for (const e of [engine, claim]) {
      const flagged: string[] = [];
      for (const l of loadCleanLines()) for (const t of e.analyze(l).tokens) if (t.verdict === "MISSPELLED") flagged.push(t.token.text);
      expect(flagged).toEqual([]);
    }
    expect(report.clean.falsePositives).toBe(0);
  });
});

describe("gate: protected tokens, dangerous words, valid paradigms", () => {
  it("protected tokens are never flagged", () => expect(report.paradigms.protectedFlagged).toBe(0));
  it("dangerous word pairs (a valid word one edit from another) are never flagged", () => expect(report.dangerous.flagged).toBe(0));
  it("valid paradigm forms: 0 false accusations, ≥95% accepted", () => {
    expect(report.paradigms.falseMisspelled).toBe(0);
    expect(report.paradigms.acceptanceRate).toBeGreaterThanOrEqual(0.95);
  });
  it("invalid paradigm forms that are flagged never carry a wrong top-1", () => expect(report.paradigms.invalidWrongFix).toEqual([]));
});

describe("gate: proper names and loanwords", () => {
  it("proper name / place forms: 0 false accusations", () => expect(evaluateNames(engine).accused).toEqual([]));
  it("accepted loanword forms (both harmonies): 0 false accusations", () => expect(evaluateLoans(engine).accused).toEqual([]));
  it("an unknown capitalised token mid-sentence is UNKNOWN, never MISSPELLED and never VALID", () => {
    for (const w of ["Зоргуйлаа", "Фэнсунбай", "Блаблабла"]) expect(engine.analyze(`Манай найз ${w} ирлээ`).tokens[2]!.verdict, w).toBe("UNKNOWN");
  });
  it("Latin tokens are protected, not 'valid Mongolian' and never accused", () => {
    const t = engine.analyze("Манай Apple компани").tokens.find((x) => x.token.text === "Apple")!;
    expect(t.verdict).not.toBe("MISSPELLED");
    expect(String(t.reasonCode)).toMatch(/^PROTECTED_/);
  });
});

describe("gate: mutation + nonsense", () => {
  it("negative mutations: no unadjudicated valid mutant, no wrong repair", () => {
    expect(report.mutation.suspects).toBe(0);
    expect(report.mutation.wrongRepairs).toBe(0);
  });
  it("nonsense strings are never VALID and never confidently corrected", () => {
    let seed = 20261008;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const C = "бвгджзклмнпрстхцчшщ";
    const V = "аэоөуүи";
    const bad: string[] = [];
    for (let i = 0; i < 1500; i += 1) {
      // no vowel pattern a real word could have: 5–9 letters of mostly consonants
      let w = "";
      const len = 5 + Math.floor(rnd() * 5);
      for (let k = 0; k < len; k += 1) w += rnd() < 0.15 ? V[Math.floor(rnd() * V.length)]! : C[Math.floor(rnd() * C.length)]!;
      const r = engine.analyze(`Энэ ${w} нь`);
      const t = r.tokens[1]!;
      if (t.verdict === "VALID") bad.push(`${w}:VALID`);
      if (t.verdict === "MISSPELLED" && r.issues[0]?.suggestionStatus === "CONFIDENT") bad.push(`${w}:CONFIDENT→${r.issues[0]!.suggestions[0]?.text}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("gate: suggestion precision", () => {
  it("synthetic suggestion precision on the lexicon ≥ 0.995", () => expect(report.synthetic.suggestionPrecision).toBeGreaterThanOrEqual(0.995));
  it("a CONFIDENT suggestion on every model-adjudicated typo is the adjudicated correction", () => {
    const o = loadAll().filter((s) => s.set === "O_COMMON_TYPOS").flatMap((s) => s.items);
    const wrong: string[] = [];
    for (const it of o) {
      const exp = it.decisions[0]!;
      const r = engine.analyze(`Энэ ${it.token} нь`);
      const i = r.issues[0];
      if (i?.suggestionStatus === "CONFIDENT" && exp.suggestion && i.suggestions[0]!.text !== exp.suggestion) wrong.push(`${it.token}→${i.suggestions[0]!.text} (expected ${exp.suggestion})`);
    }
    expect(wrong).toEqual([]);
  });
});

describe("gate: no regression against the frozen Phase-2 engine", () => {
  it("nothing Phase 2 accepted (VALID) or left UNKNOWN is now MISSPELLED, over every committed word sample", () => {
    const words = new Set<string>();
    for (const l of loadCleanLines()) for (const t of phase2.analyze(l).tokens) words.add(t.token.text);
    for (const p of loadParadigms().paradigms) for (const f of p.valid) words.add(f);
    for (const s of loadAll()) for (const it of s.items) if (it.decisions[0]!.verdict !== "MISSPELLED") words.add(it.token);
    for (const k of phase2.lexicon.keys()) words.add(k);
    const regress: string[] = [];
    for (const w of words) {
      const before = verdict(phase2, w);
      if (before !== "MISSPELLED" && verdict(engine, w) === "MISSPELLED") regress.push(`${w} (${before} → MISSPELLED)`);
    }
    expect(regress).toEqual([]);
  });
  it("the product configuration never knows LESS than Phase 2 on its own lexicon", () => {
    const missing: string[] = [];
    for (const k of phase2.lexicon.keys()) if (!engine.lexicon.has(k) && verdict(engine, k) !== "VALID") missing.push(k);
    expect(missing).toEqual([]);
  });
});

describe("gate: tiers", () => {
  it("the release-claim configuration loads only TRUSTED+REVIEWED packs and is a strict subset of the product lexicon", () => {
    expect(claim.lexicon.size).toBeLessThan(engine.lexicon.size);
    expect(claim.lexicon.packs.every((p) => /^tore-(general-core|legal-seed|reviewed-)/.test(p.id))).toBe(true);
  });
  it("a word only a PROVISIONAL pack knows is VALID in product mode and UNKNOWN in claim mode", () => {
    expect(verdict(engine, "өгүүлэх")).toBe("VALID");
    expect(verdict(claim, "өгүүлэх")).not.toBe("VALID");
  });
});

import { packsAtTier, tierOf, validatePack } from "../../src/spell-engine";
describe("gate: tier schema", () => {
  const mk = (tier: unknown, reviewStatus?: string) => ({ schema: "tore-spell-pack/1", id: "t", version: "1", layer: "GENERAL", language: "mn-Cyrl", coverage: "SEED", provenance: { source: "t", license: "t", redistributable: true, dataClass: "A_TORE_OWNED", tier, reviewStatus }, entries: [{ w: "хууль" }] });
  it("rejects an unknown tier and a REVIEWED pack that is not NATIVE_REVIEWED", () => {
    expect(validatePack(mk("GOLD")).join()).toMatch(/tier/);
    expect(validatePack(mk("REVIEWED", "PENDING_NATIVE_REVIEW")).join()).toMatch(/NATIVE_REVIEWED/);
    expect(validatePack(mk("REVIEWED", "NATIVE_REVIEWED"))).toEqual([]);
    expect(validatePack(mk("TRUSTED"))).toEqual([]);
  });
  it("a pack without a tier is PROVISIONAL, and REJECTED is never loaded", () => {
    const p = mk(undefined) as never;
    expect(tierOf(p)).toBe("PROVISIONAL");
    expect(packsAtTier([p, mk("REJECTED") as never, mk("TRUSTED") as never], "PROVISIONAL")).toHaveLength(2);
    expect(packsAtTier([p, mk("TRUSTED") as never], "TRUSTED")).toHaveLength(1);
  });
  it("every shipped pack declares a tier explicitly or is PROVISIONAL by default; only TRUSTED packs are the committed production dictionaries", () => {
    const trusted = engineTrusted();
    expect(trusted.sort()).toEqual(["tore-general-core", "tore-legal-seed"]);
  });
});
function engineTrusted(): string[] {
  const e = createSpellEngineV1({ minTier: "TRUSTED" });
  return e.lexicon.packs.map((p) => p.id);
}
