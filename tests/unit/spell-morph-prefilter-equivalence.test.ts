import { describe, expect, it } from "vitest";
import { BUNDLED_PACKS } from "../../src/spell-engine";
import { Lexicon } from "../../src/spell-engine/lexicon/lexicon";
import { MorphAnalyzer } from "../../src/spell-engine/morphology/analyzer";
import { nounSuffixSurfaces, verbSuffixSurfaces } from "../../src/spell-engine/morphology/inventory";
import { loadAll } from "../evaluation/spell-v3/gold-sets";

/**
 * The stem-alternation prefilters (elided / vowel-drop / soft / hidden-г base sets) must be PURE speed-ups: replacing them by
 * «always true» (the Phase-2 behaviour: probe the lexicon for every split) must give identical analyses.
 */
describe("morphology prefilters are behaviour-preserving", () => {
  const lex = new Lexicon(BUNDLED_PACKS);
  const fast = new MorphAnalyzer(lex);
  const slow = new MorphAnalyzer(lex);
  const all = { has: () => true };
  for (const k of ["elidedBases", "vowelDropBases", "softBases", "hiddenGBases"]) (slow as unknown as Record<string, unknown>)[k] = all;

  const sample = new Set<string>();
  const keys = [...lex.keys()];
  for (let i = 0; i < keys.length; i += 23) {
    const k = keys[i]!;
    sample.add(k);
    for (const s of nounSuffixSurfaces().slice(0, 40)) sample.add(k + s);
    for (const s of verbSuffixSurfaces().slice(0, 40)) sample.add(k.replace(/х$/u, "") + s);
    if (k.length > 4) {
      sample.add(k.slice(0, -2) + k.slice(-1) + "ын"); // elision look-alikes
      sample.add(k.slice(0, -1) + "ыг");
    }
  }
  for (const s of loadAll()) for (const it of s.items) sample.add(it.token.toLowerCase());

  it(`identical parses and violations on ${"≈"}${Math.round(sample.size / 1000)}k strings`, () => {
    const key = (a: MorphAnalyzer, w: string) => {
      const r = a.analyze(w);
      return JSON.stringify([r.parses.map((p) => [p.lemma, p.tags.join("+")]), r.violations.map((v) => [v.lemma, v.kind, v.observed, v.expected, v.repaired])]);
    };
    const diff: string[] = [];
    for (const w of sample) if (key(fast, w) !== key(slow, w)) diff.push(w);
    expect(diff.slice(0, 10)).toEqual([]);
    expect(sample.size).toBeGreaterThan(5000);
  }, 120_000);
});
