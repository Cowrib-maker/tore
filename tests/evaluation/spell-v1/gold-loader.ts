/**
 * Loader for the TORE morphology gold datasets (schema tore-spell-verb-gold/2).
 *
 * DATASET CLASSES (never mixed silently; every report names the one it used):
 *   REFERENCE_ORACLE   UniMorph-derived reference material. NOT committed (local env var only).
 *   TORE_AUTHORED      written inside TORE (VERB_GOLD_DRAFT_V1). AI engineering draft.
 *   NATIVE_REVIEWED    only records a named human native linguist actually reviewed. Empty today.
 *   REGRESSION         confirmed bug cases.
 *   PRODUCTION_SAMPLE  clean real-world text, rights permitting. None exists yet.
 *
 * A file's `reviewStatus` may only be changed by a person. Tests refuse any record that claims
 * NATIVE_REVIEWED without a reviewer name and date, and refuse the TORE_AUTHORED draft claiming it.
 */
import fs from "node:fs";
import path from "node:path";
import { createSpellEngineV1, type DataPack, type SpellEngineV1 } from "../../../src/spell-engine";

export type GoldExpected = "VALID" | "INVALID" | "VALID_UNSUPPORTED" | "DERIVATION" | "AMBIGUOUS";
export type DatasetClass = "TORE_AUTHORED" | "NATIVE_REVIEWED" | "REGRESSION";
export type ReviewStatus = "PENDING_NATIVE_REVIEW" | "NATIVE_REVIEWED" | "NATIVE_REJECTED";

export type GoldRecord = {
  id: string;
  dataset: string;
  datasetClass: DatasetClass;
  lemma: string;
  stemClass: string;
  harmony: string;
  flags: string[];
  surface: string;
  expected: GoldExpected;
  /** INFLECTION for supported forms, DERIVATION for derived stems, NONE for invalid forms. */
  scope: "INFLECTION" | "DERIVATION" | "NONE";
  tags: string[];
  suffixChain: string[];
  reason: string | null;
  confidence: "HIGH" | "MEDIUM";
  source: string;
  authorKind: string;
  provenance: string;
  reviewStatus: ReviewStatus;
  reviewer: string | null;
  reviewedOn: string | null;
  reviewerNote: string | null;
};

type RawDoc = {
  schema: string;
  dataset: string;
  datasetClass: DatasetClass;
  version: string;
  note?: string;
  defaults: { source: string; authorKind: string; provenance: string; reviewStatus: ReviewStatus; reviewerNote: string | null; confidence: "HIGH" | "MEDIUM" };
  lemmas: {
    lemma: string;
    stemClass: string;
    harmony: string;
    flags?: string[];
    reviewer?: string;
    reviewedOn?: string;
    entries: [string, GoldExpected, string[], string[], string | null, string | null][];
  }[];
};

const DIR = path.join(__dirname, "gold");

export function loadGoldFile(file: string): { doc: RawDoc; records: GoldRecord[] } {
  const doc = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")) as RawDoc;
  const records: GoldRecord[] = [];
  let n = 0;
  for (const rec of doc.lemmas) {
    for (const [surface, expected, tags, suffixChain, reason, confidence] of rec.entries) {
      n += 1;
      records.push({
        id: `${doc.dataset}-${String(n).padStart(4, "0")}`,
        dataset: doc.dataset,
        datasetClass: doc.datasetClass,
        lemma: rec.lemma,
        stemClass: rec.stemClass,
        harmony: rec.harmony,
        flags: rec.flags ?? [],
        surface,
        expected,
        scope: expected === "DERIVATION" ? "DERIVATION" : expected === "VALID" || expected === "VALID_UNSUPPORTED" ? "INFLECTION" : "NONE",
        tags,
        suffixChain,
        reason,
        confidence: (confidence as "HIGH" | "MEDIUM" | null) ?? doc.defaults.confidence,
        source: doc.defaults.source,
        authorKind: doc.defaults.authorKind,
        provenance: doc.defaults.provenance,
        reviewStatus: doc.defaults.reviewStatus,
        reviewer: rec.reviewer ?? null,
        reviewedOn: rec.reviewedOn ?? null,
        reviewerNote: doc.defaults.reviewerNote,
      });
    }
  }
  return { doc, records };
}

export const loadVerbGoldDraft = () => loadGoldFile("verb-gold-draft-v1.json");
export const loadNativeReviewed = () => loadGoldFile("native-reviewed-v1.json");

/** One small engine per lemma record: the record's own flags decide its stem class. */
export function engineForRecord(r: Pick<GoldRecord, "lemma" | "flags">): SpellEngineV1 {
  const pack = {
    schema: "tore-spell-pack/1",
    id: "gold",
    version: "1",
    layer: "GENERAL",
    language: "mn-Cyrl",
    coverage: "SEED",
    provenance: { source: "gold lemma", license: "TORE proprietary", redistributable: true },
    entries: [{ w: r.lemma, pos: "V", flags: r.flags.length ? r.flags : undefined }],
  } as unknown as DataPack;
  return createSpellEngineV1({ packs: [pack], typoPairs: [] });
}

/** Does the engine's verdict satisfy the record's expectation? */
export function satisfies(expected: GoldExpected, verdict: "VALID" | "MISSPELLED" | "UNKNOWN"): boolean {
  switch (expected) {
    case "VALID":
      return verdict === "VALID";
    case "INVALID":
      return verdict !== "VALID";
    case "VALID_UNSUPPORTED":
    case "DERIVATION":
      return verdict === "UNKNOWN";
    case "AMBIGUOUS":
      return verdict !== "MISSPELLED";
  }
}

/** Structural validation; returns problems (empty = ok). */
export function validateGold(doc: RawDoc, records: readonly GoldRecord[]): string[] {
  const problems: string[] = [];
  if (doc.schema !== "tore-spell-verb-gold/2") problems.push(`schema ${doc.schema}`);
  const seen = new Set<string>();
  for (const r of records) {
    const key = `${r.lemma}|${r.flags.join(",")}|${r.surface}`;
    if (seen.has(key)) problems.push(`duplicate ${key}`);
    seen.add(key);
    if (!/^[Ѐ-ӿ-]+$/u.test(r.surface)) problems.push(`${r.id}: non-Cyrillic surface ${r.surface}`);
    if (r.expected === "VALID" && r.tags.length === 0) problems.push(`${r.id}: VALID without tags`);
    if (r.expected !== "VALID" && !r.reason) problems.push(`${r.id}: ${r.expected} without reason`);
    if (doc.datasetClass === "TORE_AUTHORED" && r.reviewStatus === "NATIVE_REVIEWED") problems.push(`${r.id}: an AI-authored draft must not claim NATIVE_REVIEWED`);
    if (r.reviewStatus === "NATIVE_REVIEWED" && (!r.reviewer || !r.reviewedOn)) problems.push(`${r.id}: NATIVE_REVIEWED needs reviewer and reviewedOn`);
  }
  return problems;
}

// ── REGRESSION dataset ─────────────────────────────────────────────────────

export type RegressionCase = {
  surface: string;
  lexicon: { w: string; pos: "N" | "V"; flags?: string[] }[];
  mustBe: "VALID" | "UNKNOWN" | "MISSPELLED";
  suggestion?: string;
  status: string;
  note: string;
};

export function loadRegression(): RegressionCase[] {
  const doc = JSON.parse(fs.readFileSync(path.join(DIR, "regression-v1.json"), "utf8")) as { cases: RegressionCase[] };
  return doc.cases;
}

export function runRegression(): { total: number; failures: string[] } {
  const failures: string[] = [];
  const cases = loadRegression();
  for (const c of cases) {
    const pack = {
      schema: "tore-spell-pack/1",
      id: "regression",
      version: "1",
      layer: "GENERAL",
      language: "mn-Cyrl",
      coverage: "SEED",
      provenance: { source: "regression", license: "TORE proprietary", redistributable: true },
      entries: c.lexicon,
    } as unknown as DataPack;
    const e = createSpellEngineV1({ packs: [pack], typoPairs: [] });
    const r = e.checkWord(c.surface);
    if (r.verdict !== c.mustBe) failures.push(`${c.surface}: expected ${c.mustBe}, got ${r.verdict} (${c.note})`);
    else if (c.suggestion && r.issue?.suggestions[0]?.text !== c.suggestion) failures.push(`${c.surface}: expected suggestion ${c.suggestion}, got ${r.issue?.suggestions[0]?.text}`);
  }
  return { total: cases.length, failures };
}
