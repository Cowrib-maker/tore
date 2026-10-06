import type { LexiconLayer } from "../core/types";
import { normalizeToken } from "../tokenizer/normalize";

/**
 * Versioned language data pack. Vocabulary lives in DATA (JSON), never in
 * TypeScript, so a lexicon can be audited, diffed, licensed and shipped
 * independently of the engine.
 *
 * Deliberately the simplest schema that can faithfully carry a lemma lexicon
 * with morphology hints; richer resources (frequency, full affix flags) map
 * onto `flags`/`freq` without a schema change.
 */

export const PACK_SCHEMA = "tore-spell-pack/1" as const;

export type Pos =
  | "N" // noun / nominal: takes the case/plural/reflexive paradigm
  | "V" // verb: lemma is the -х infinitive
  | "ADJ"
  | "NUM"
  | "PRON"
  | "PART" // particles, conjunctions, postpositions, adverbs: no inflection
  | "X"; // unspecified (treated leniently)

/**
 * Entry flags:
 *  - "form"      accepted surface form only; no paradigm is generated from it
 *  - "no-infl"   closed-class word; never inflected
 *  - "hidden-g"  noun with a hidden г (байшин → байшингийн)
 *  - "hidden-n"  noun with a hidden н (ногоон → ногооны)
 *  - "soft"      ь-final noun (хууль) — set automatically from spelling
 *  - "harmony:M" / "harmony:F"  force suffix harmony (loanwords)
 *  Verb stem-class flags (pos "V", see morphology/analyzer.ts «VERB STEM MODEL»):
 *  - "vstem"     the stem keeps its vowel before consonant-initial suffixes
 *                (ажиллах → ажилла-сан). Enables the STEM_VOWEL_MISSING repair.
 *  - "hv:<v>"    hidden-vowel root whose vowel is <v> (амрах hv:а → амар-сан);
 *                forces the hidden-vowel stem and enables the repair.
 *  - "soft-i"    ь-stem verb (барих, хорих): барьсан but баривал.
 */
export type PackEntry = {
  w: string;
  pos?: Pos;
  flags?: string[];
  /** Relative frequency (any positive scale), when the source provides one. */
  freq?: number;
};

export type PackProvenance = {
  source: string;
  license: string;
  /** May this data ship inside the paid desktop product? */
  redistributable: boolean;
  notes?: string;
};

export type DataPack = {
  schema: typeof PACK_SCHEMA;
  id: string;
  version: string;
  layer: LexiconLayer;
  language: "mn-Cyrl";
  /**
   * SEED: a curated starter set. Absence from it proves nothing, so
   * edit-distance DETECTION is disabled (words may only be corrected when a
   * deterministic rule fires). BROAD: a general lexicon whose absence is
   * meaningful evidence; enables stronger detection rules.
   */
  coverage: "SEED" | "BROAD";
  provenance: PackProvenance;
  entries: PackEntry[];
};

const LAYERS: readonly LexiconLayer[] = [
  "GENERAL",
  "LEGAL",
  "PROPER_NOUN",
  "ABBREVIATION",
  "USER_DEFINED",
];
const POS: readonly Pos[] = ["N", "V", "ADJ", "NUM", "PRON", "PART", "X"];
const WORD_OK = /^[Ѐ-ӿ][Ѐ-ӿ'-]*$/u;

/**
 * Validate a pack. Returns human-readable problems (empty = valid). The
 * loader refuses an invalid pack outright: a half-loaded lexicon would
 * silently change what counts as "valid".
 */
export function validatePack(pack: unknown): string[] {
  const problems: string[] = [];
  const p = pack as Partial<DataPack> | null;
  if (!p || typeof p !== "object") return ["pack is not an object"];
  if (p.schema !== PACK_SCHEMA) problems.push(`schema must be ${PACK_SCHEMA}`);
  if (!p.id || typeof p.id !== "string") problems.push("id is required");
  if (!p.version || typeof p.version !== "string") problems.push("version is required");
  if (!p.layer || !LAYERS.includes(p.layer)) problems.push("layer is invalid");
  if (p.language !== "mn-Cyrl") problems.push("language must be mn-Cyrl");
  if (p.coverage !== "SEED" && p.coverage !== "BROAD") problems.push("coverage must be SEED or BROAD");
  if (!p.provenance || typeof p.provenance.source !== "string" || typeof p.provenance.license !== "string") {
    problems.push("provenance.source and provenance.license are required");
  } else if (typeof p.provenance.redistributable !== "boolean") {
    problems.push("provenance.redistributable must be a boolean");
  }
  if (!Array.isArray(p.entries)) {
    problems.push("entries must be an array");
    return problems;
  }
  const seen = new Set<string>();
  const proper = p.layer === "PROPER_NOUN" || p.layer === "ABBREVIATION";
  p.entries.forEach((e, i) => {
    if (!e || typeof e.w !== "string" || !e.w) {
      problems.push(`entry ${i}: missing word`);
      return;
    }
    if (!WORD_OK.test(e.w)) problems.push(`entry ${i}: "${e.w}" is not a Cyrillic word`);
    if (!proper && e.w !== e.w.toLowerCase()) problems.push(`entry ${i}: "${e.w}" must be lower-case outside name/abbreviation layers`);
    if (e.pos !== undefined && !POS.includes(e.pos)) problems.push(`entry ${i}: invalid pos "${e.pos}"`);
    if (e.flags !== undefined && (!Array.isArray(e.flags) || e.flags.some((f) => typeof f !== "string"))) {
      problems.push(`entry ${i}: flags must be strings`);
    }
    if (e.freq !== undefined && !(typeof e.freq === "number" && e.freq > 0)) {
      problems.push(`entry ${i}: freq must be a positive number`);
    }
    const key = `${normalizeToken(e.w)}|${e.pos ?? "X"}`;
    if (seen.has(key)) problems.push(`entry ${i}: duplicate "${e.w}" (${e.pos ?? "X"})`);
    seen.add(key);
  });
  return problems;
}
