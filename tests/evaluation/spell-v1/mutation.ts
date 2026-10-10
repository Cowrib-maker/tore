/**
 * Controlled negative-test generation for the verb morphology.
 *
 * Every VALID gold form is mutated in a named way. A mutated string the engine returns VALID for is
 * classified as
 *   COLLISION_GOLD     it is itself a VALID gold form of some lemma (a legitimate collision)
 *   COLLISION_LEXICON  it is a lemma / word in the lexicon
 *   ADJUDICATED        a person decided it is a legitimate Mongolian form (ADJUDICATED_LEGITIMATE)
 *   SUSPECT            anything else: a possible false VALID that must be inspected by a person
 * The target is zero SUSPECTs.
 */
import fs from "node:fs";
import path from "node:path";
import { createSpellEngineV1, type DataPack, type SpellEngineV1 } from "../../../src/spell-engine";
import { mulberry32 } from "../../../src/spell-engine/evaluation/metrics";
import { loadVerbGoldDraft, type GoldRecord } from "./gold-loader";

export type MutationKind =
  | "WRONG_VOWEL"
  | "WRONG_HARMONY"
  | "WRONG_SUFFIX"
  | "MISSING_STEM_VOWEL"
  | "EXTRA_CONSONANT"
  | "MISSING_CONSONANT"
  | "DOUBLED_CONSONANT"
  | "CASE_LIKE_ENDING"
  | "SUFFIX_ORDER"
  | "RANDOM_EDIT"
  | "NOUN_STEM_VERB_SUFFIX";

export const MUTATION_KINDS: readonly MutationKind[] = [
  "WRONG_VOWEL",
  "WRONG_HARMONY",
  "WRONG_SUFFIX",
  "MISSING_STEM_VOWEL",
  "EXTRA_CONSONANT",
  "MISSING_CONSONANT",
  "DOUBLED_CONSONANT",
  "CASE_LIKE_ENDING",
  "SUFFIX_ORDER",
  "RANDOM_EDIT",
  "NOUN_STEM_VERB_SUFFIX",
];

/**
 * Mutated strings judged to be legitimate Mongolian (not engine errors), with the reason class.
 * The judgement was made by the AI engineering author (reviewStatus AI_ADJUDICATED_PENDING_NATIVE_REVIEW in
 * gold/mutation-adjudications-v1.json); it is NOT a native-linguist review. A string absent from the file is a
 * SUSPECT and fails the gate.
 */
export const ADJUDICATED_LEGITIMATE: Readonly<Record<string, string>> = (() => {
  const doc = JSON.parse(fs.readFileSync(path.join(__dirname, "gold", "mutation-adjudications-v1.json"), "utf8")) as { entries: Record<string, string> };
  return doc.entries;
})();

/**
 * Repairs a person judged acceptable although they differ from the original form
 * (the mutated string is genuinely ambiguous between two intended words).
 */
export const ADJUDICATED_REPAIRS: Readonly<Record<string, string>> = {
  "ажилл→ажил": "«ажилл» is a doubled-letter typo of the noun ажил as much as a truncated ажилла!: ambiguous, not a defect",
};

const SINGLE_EDIT = new Set<MutationKind>(["WRONG_VOWEL", "WRONG_HARMONY", "MISSING_STEM_VOWEL", "EXTRA_CONSONANT", "MISSING_CONSONANT", "DOUBLED_CONSONANT", "RANDOM_EDIT"]);

const VOWELS = [..."аэиоуөүяеёюы"];
const CONSONANTS = [..."бвгджзклмнпрстфхцчшщ"];
const FLIP: Record<string, string> = { а: "э", э: "а", о: "ө", ө: "о", у: "ү", ү: "у", ы: "и" };
const CASE_ENDINGS = ["ийн", "ыг", "ийг", "аас", "ээс", "тай", "тэй", "аар", "ээр", "нд", "ны", "ний", "ууд", "үүд"];
const NOUNS = ["ном", "гэр", "хууль", "байшин", "хот", "хүн", "эрх", "иргэн", "заалт", "хэрэг", "ажил", "асуудал"];

export type MutationOutcome = {
  kind: MutationKind;
  original: string;
  lemma: string;
  mutated: string;
  verdict: "VALID" | "MISSPELLED" | "UNKNOWN";
  detail: "COLLISION_GOLD" | "COLLISION_LEXICON" | "ADJUDICATED" | "SUSPECT" | null;
  suggestion: string | null;
  repairIsOriginal: boolean | null;
};

export type MutationReport = {
  seed: number;
  mutated: number;
  byKind: Record<string, { n: number; valid: number; collisions: number; suspects: number; misspelled: number; unknown: number }>;
  valid: number;
  collisions: number;
  suspects: MutationOutcome[];
  misspelled: number;
  wrongRepairs: MutationOutcome[];
  unknown: number;
};

function suffixPart(r: GoldRecord): string {
  const chain = r.suffixChain.join("").replace(/-/g, "");
  return chain && r.surface.endsWith(chain) ? chain : "";
}

export function mutate(kind: MutationKind, r: GoldRecord, rng: () => number, suffixPool: readonly string[]): string | null {
  const s = r.surface;
  const suf = suffixPart(r);
  const stem = suf ? s.slice(0, s.length - suf.length) : s;
  const pick = <T>(a: readonly T[]) => a[Math.floor(rng() * a.length)]!;
  switch (kind) {
    case "WRONG_VOWEL": {
      const idx = [...suf].map((c, i) => (VOWELS.includes(c) ? i : -1)).filter((i) => i >= 0);
      if (idx.length === 0) return null;
      const i = pick(idx);
      const cand = VOWELS.filter((v) => v !== suf[i]);
      return stem + suf.slice(0, i) + pick(cand) + suf.slice(i + 1);
    }
    case "WRONG_HARMONY": {
      const flipped = [...suf].map((c) => FLIP[c] ?? c).join("");
      return flipped === suf ? null : stem + flipped;
    }
    case "WRONG_SUFFIX": {
      const other = pick(suffixPool);
      return other === suf ? null : stem + other;
    }
    case "MISSING_STEM_VOWEL": {
      if (r.stemClass !== "VOWEL_STEM" && r.stemClass !== "EPENTHETIC") return null;
      const idx = [...stem].map((c, i) => (VOWELS.includes(c) ? i : -1)).filter((i) => i >= 0);
      if (idx.length === 0) return null;
      const last = idx[idx.length - 1]!;
      return stem.slice(0, last) + stem.slice(last + 1) + suf;
    }
    case "EXTRA_CONSONANT": {
      const i = 1 + Math.floor(rng() * (s.length - 1));
      return s.slice(0, i) + pick(CONSONANTS) + s.slice(i);
    }
    case "MISSING_CONSONANT": {
      const idx = [...s].map((c, i) => (CONSONANTS.includes(c) && i > 0 ? i : -1)).filter((i) => i >= 0);
      if (idx.length === 0) return null;
      const i = pick(idx);
      return s.slice(0, i) + s.slice(i + 1);
    }
    case "DOUBLED_CONSONANT": {
      const idx = [...s].map((c, i) => (CONSONANTS.includes(c) ? i : -1)).filter((i) => i >= 0);
      if (idx.length === 0) return null;
      const i = pick(idx);
      return s.slice(0, i + 1) + s[i] + s.slice(i + 1);
    }
    case "CASE_LIKE_ENDING":
      return stem + pick(CASE_ENDINGS);
    case "SUFFIX_ORDER": {
      const other = pick(suffixPool);
      return other === suf || !suf ? null : stem + other + suf;
    }
    case "RANDOM_EDIT": {
      const i = Math.floor(rng() * s.length);
      const op = Math.floor(rng() * 3);
      const c = pick([...VOWELS, ...CONSONANTS]);
      return op === 0 ? s.slice(0, i) + c + s.slice(i + 1) : op === 1 ? s.slice(0, i) + c + s.slice(i) : s.slice(0, i) + s.slice(i + 1);
    }
    case "NOUN_STEM_VERB_SUFFIX":
      return suf ? pick(NOUNS) + suf : null;
  }
}

/** Engine holding every gold lemma (flagged variant wins) plus common nouns. */
export function combinedEngine(records: readonly GoldRecord[]): { engine: SpellEngineV1; lemmas: Set<string> } {
  const byLemma = new Map<string, string[]>();
  for (const r of records) {
    const cur = byLemma.get(r.lemma);
    if (!cur || (cur.length === 0 && r.flags.length > 0)) byLemma.set(r.lemma, r.flags);
  }
  const entries = [
    ...[...byLemma.entries()].map(([w, flags]) => ({ w, pos: "V", flags: flags.length ? flags : undefined })),
    ...NOUNS.map((w) => ({ w, pos: "N" })),
  ];
  const pack = {
    schema: "tore-spell-pack/1",
    id: "mutation",
    version: "1",
    layer: "GENERAL",
    language: "mn-Cyrl",
    coverage: "SEED",
    provenance: { source: "gold lemmas", license: "TORE proprietary", redistributable: true },
    entries,
  } as unknown as DataPack;
  return { engine: createSpellEngineV1({ packs: [pack], typoPairs: [] }), lemmas: new Set(entries.map((e) => e.w)) };
}

export function runMutationSuite(opts: { seed?: number; perEntry?: number } = {}): MutationReport {
  const seed = opts.seed ?? 20261006;
  const perEntry = opts.perEntry ?? 3;
  const { records } = loadVerbGoldDraft();
  const valid = records.filter((r) => r.expected === "VALID");
  const goldValid = new Set(valid.map((r) => r.surface));
  const suffixPool = [...new Set(valid.map(suffixPart).filter(Boolean))].sort();
  const { engine, lemmas } = combinedEngine(records);
  const rng = mulberry32(seed);
  const report: MutationReport = { seed, mutated: 0, byKind: {}, valid: 0, collisions: 0, suspects: [], misspelled: 0, wrongRepairs: [], unknown: 0 };
  const seen = new Set<string>();
  valid.forEach((r, idx) => {
    for (let k = 0; k < perEntry; k += 1) {
      const kind = MUTATION_KINDS[(idx * perEntry + k) % MUTATION_KINDS.length]!;
      const m = mutate(kind, r, rng, suffixPool);
      if (!m || m === r.surface || m.length < 2) continue;
      const key = `${kind}|${r.lemma}|${m}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const res = engine.checkWord(m);
      const bucket = (report.byKind[kind] ??= { n: 0, valid: 0, collisions: 0, suspects: 0, misspelled: 0, unknown: 0 });
      bucket.n += 1;
      report.mutated += 1;
      let detail: MutationOutcome["detail"] = null;
      let suggestion: string | null = null;
      let repairIsOriginal: boolean | null = null;
      if (res.verdict === "VALID") {
        report.valid += 1;
        bucket.valid += 1;
        if (goldValid.has(m)) detail = "COLLISION_GOLD";
        else if (lemmas.has(m)) detail = "COLLISION_LEXICON";
        else if (ADJUDICATED_LEGITIMATE[m]) detail = "ADJUDICATED";
        else detail = "SUSPECT";
        if (detail === "SUSPECT") {
          bucket.suspects += 1;
          report.suspects.push({ kind, original: r.surface, lemma: r.lemma, mutated: m, verdict: "VALID", detail, suggestion, repairIsOriginal });
        } else {
          report.collisions += 1;
          bucket.collisions += 1;
        }
      } else if (res.verdict === "MISSPELLED") {
        report.misspelled += 1;
        bucket.misspelled += 1;
        suggestion = res.issue?.suggestions[0]?.text ?? null;
        repairIsOriginal = suggestion === r.surface;
        // Only single-edit kinds have a meaningful «original». A repair that is another gold-valid form is
        // not wrong either (the mutation may sit between two forms).
        if (SINGLE_EDIT.has(kind) && !repairIsOriginal && !(suggestion && goldValid.has(suggestion)) && !ADJUDICATED_REPAIRS[`${m}→${suggestion}`]) {
          report.wrongRepairs.push({ kind, original: r.surface, lemma: r.lemma, mutated: m, verdict: "MISSPELLED", detail: null, suggestion, repairIsOriginal });
        }
      } else {
        report.unknown += 1;
        bucket.unknown += 1;
      }
    }
  });
  return report;
}
