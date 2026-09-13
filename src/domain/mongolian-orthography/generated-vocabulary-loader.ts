/**
 * Node-only loader for a committed {@link GeneratedVocabularyArtifact}
 * (e.g. generated/legal-vocabulary.json) — reads the file and validates
 * its shape, but does not register anything: call
 * `registerGeneratedVocabulary` from dictionary.ts yourself with the
 * result if/when you actually want a build or server bootstrap to merge
 * it in. Nothing in dictionary.ts or suggestions.ts imports this file,
 * so it introduces no filesystem dependency into the request path or the
 * default test run — it only exists for whoever explicitly wires it up
 * (see generated-vocabulary-activation.ts for the flag-gated caller).
 *
 * Kept separate from corpus-vocabulary.ts, which is filesystem-free by
 * design (see its module doc comment) so it can run in any JS
 * environment, not just Node.
 *
 * Validation is a full, deterministic schema/integrity check (see
 * {@link validateGeneratedVocabularyArtifactShape}) run against a small,
 * fixed-size artifact (single digits to low tens of entries) — cheap
 * enough to run on every load, not something that needs to be skipped or
 * cached for runtime startup cost. The MUCH more expensive
 * "is this artifact's data still reproducible from the corpus that
 * produced it" cross-check lives in a test
 * (tests/unit/generated-vocabulary-artifact-integrity.test.ts), never
 * here — that one genuinely does need the corpus, which this loader must
 * never touch.
 */

import { readFileSync } from "node:fs";

import type {
  GeneratedVocabularyArtifact,
  GeneratedVocabularyEntry,
} from "@/domain/mongolian-orthography/corpus-vocabulary";
import {
  compareGeneratedVocabularyEntries,
  VOCABULARY_GENERATOR_VERSION,
} from "@/domain/mongolian-orthography/corpus-vocabulary";
import { normalizeMongolianWord } from "@/domain/mongolian-orthography/engine";

/** schemaVersion 2 only accepts COMMON/MORPHOLOGICAL_STEM — LEGAL is
 * excluded because computeTrustLevel() policy-caps it at REVIEW forever,
 * so a LEGAL entry can never legitimately carry trustLevel: "TRUSTED"
 * (see corpus-vocabulary.ts's GeneratedVocabularyEntry doc comment). A
 * PROPER_NOUN or ABBREVIATION entry was never a valid category here at
 * all, in any schema version — those categories cap at ATTESTED and
 * never even reach the generated-artifact pipeline's approval step. */
const VALID_CATEGORIES = new Set(["COMMON", "MORPHOLOGICAL_STEM"]);
const EXPECTED_SCHEMA_VERSION = 2;
/** Lowercase-only mirror of corpus-vocabulary.ts's ONLY_MONGOLIAN_LETTERS_RE,
 * applied to an already-normalized (lowercased) word. */
const ONLY_MONGOLIAN_LETTERS_LOWERCASE_RE = /^[а-яөүёъьы]+$/u;

export type ArtifactValidationResult =
  | { ok: true; artifact: GeneratedVocabularyArtifact }
  | { ok: false; error: string };

function describeEntry(entry: unknown, index: number): string {
  const word = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>).word : undefined;
  return typeof word === "string" ? `entry ${index} ("${word}")` : `entry ${index}`;
}

function validateEntryShape(value: unknown, index: number): string | null {
  if (typeof value !== "object" || value === null) {
    return `${describeEntry(value, index)} is not an object`;
  }
  const entry = value as Record<string, unknown>;

  if (typeof entry.word !== "string" || entry.word.length === 0) {
    return `${describeEntry(value, index)} has a missing or empty "word"`;
  }
  // Malformed/empty-token check: a word that normalizes to nothing (or to
  // something shorter than the dictionary's own minimum) can never
  // usefully register as vocabulary — reject it here rather than let
  // registerGeneratedVocabulary silently no-op on it later (dictionary.ts's
  // addWord/addStem already skip anything shorter than 2 normalized
  // characters, which would otherwise make a malformed entry vanish
  // silently instead of failing the artifact load loudly).
  const normalized = normalizeMongolianWord(entry.word);
  if (!normalized || normalized.length < 2) {
    return `${describeEntry(value, index)} normalizes to an empty/too-short token ("${entry.word}" -> "${normalized}")`;
  }
  // normalizeMongolianWord only trims punctuation/casing — it does not
  // reject digits or Latin letters, so a purely-numeric or non-Mongolian
  // token (e.g. a stray citation number or OCR artifact) would otherwise
  // slip past the length check above. A generated-vocabulary word must be
  // ONLY Mongolian letters, same as the extraction pipeline's own
  // tokenizer requires (see ONLY_MONGOLIAN_LETTERS_RE in
  // corpus-vocabulary.ts) — this loader can't import that private regex
  // directly, so it applies the identical rule against the already-
  // normalized (lowercased) form.
  if (!ONLY_MONGOLIAN_LETTERS_LOWERCASE_RE.test(normalized)) {
    return `${describeEntry(value, index)} is not made of only Mongolian letters ("${entry.word}")`;
  }

  if (typeof entry.category !== "string" || !VALID_CATEGORIES.has(entry.category)) {
    return `${describeEntry(value, index)} has an invalid category ("${String(entry.category)}") — must be one of ${[...VALID_CATEGORIES].join(", ")}`;
  }

  // The core controlled-activation safety property: an entry that isn't
  // exactly trustLevel "TRUSTED" is refused outright, not silently
  // filtered — a hand-edited or corrupted artifact containing a REVIEW or
  // ATTESTED entry fails the WHOLE file's validation rather than being
  // partially, silently accepted.
  if (entry.trustLevel !== "TRUSTED") {
    return `${describeEntry(value, index)} has trustLevel "${String(entry.trustLevel)}", not "TRUSTED" — only TRUSTED entries may appear in a generated-vocabulary artifact`;
  }

  if (typeof entry.occurrenceCount !== "number" || !Number.isFinite(entry.occurrenceCount) || entry.occurrenceCount < 0) {
    return `${describeEntry(value, index)} has an invalid occurrenceCount`;
  }
  if (typeof entry.documentFrequency !== "number" || !Number.isFinite(entry.documentFrequency) || entry.documentFrequency < 0) {
    return `${describeEntry(value, index)} has an invalid documentFrequency`;
  }

  return null;
}

/**
 * Pure, fs-free schema/integrity validator over an already-parsed value —
 * exported so tests can exercise every rejection path (malformed shape,
 * non-TRUSTED entry, duplicate word, out-of-order entries) with plain
 * constructed objects, without writing a temp file for every case.
 * {@link loadGeneratedVocabularyFile} is a thin fs wrapper around this.
 */
export function validateGeneratedVocabularyArtifactShape(value: unknown): ArtifactValidationResult {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "artifact is not an object" };
  }
  const artifact = value as Record<string, unknown>;

  if (artifact.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `unexpected schemaVersion ${JSON.stringify(artifact.schemaVersion)} (expected ${EXPECTED_SCHEMA_VERSION})`,
    };
  }
  if (typeof artifact.generatorVersion !== "number") {
    return { ok: false, error: "missing or invalid generatorVersion" };
  }
  if (typeof artifact.generatedAt !== "string" || artifact.generatedAt.length === 0) {
    return { ok: false, error: "missing or invalid generatedAt" };
  }
  if (typeof artifact.source !== "object" || artifact.source === null) {
    return { ok: false, error: "missing or invalid source" };
  }
  if (!Array.isArray(artifact.entries)) {
    return { ok: false, error: "entries is not an array" };
  }

  for (let i = 0; i < artifact.entries.length; i += 1) {
    const entryError = validateEntryShape(artifact.entries[i], i);
    if (entryError) {
      return { ok: false, error: entryError };
    }
  }
  const entries = artifact.entries as GeneratedVocabularyEntry[];

  // No duplicate normalized words: two entries for the same word (even
  // under different surface casing/category) would make registration
  // order-dependent and silently non-deterministic about which
  // occurrenceCount/category "wins" — buildGeneratedVocabularyArtifact's
  // own dedupeByWord step is supposed to make this structurally
  // impossible upstream, so finding one here means the file was hand-
  // edited or corrupted after generation.
  const seenNormalized = new Map<string, string>();
  for (const entry of entries) {
    const normalized = normalizeMongolianWord(entry.word);
    const existing = seenNormalized.get(normalized);
    if (existing !== undefined && existing !== entry.word) {
      return { ok: false, error: `duplicate normalized word: "${existing}" and "${entry.word}" both normalize to "${normalized}"` };
    }
    if (existing === entry.word) {
      return { ok: false, error: `duplicate word entry: "${entry.word}" appears more than once` };
    }
    seenNormalized.set(normalized, entry.word);
  }

  // Deterministically sorted: must match the exact comparator the builder
  // uses, so a reviewable, stable diff is actually guaranteed, not just
  // usually true.
  for (let i = 1; i < entries.length; i += 1) {
    if (compareGeneratedVocabularyEntries(entries[i - 1]!, entries[i]!) > 0) {
      return {
        ok: false,
        error: `entries are not sorted: "${entries[i - 1]!.word}" (index ${i - 1}) should come after "${entries[i]!.word}" (index ${i})`,
      };
    }
  }

  return { ok: true, artifact: artifact as unknown as GeneratedVocabularyArtifact };
}

export type LoadGeneratedVocabularyResult =
  | { ok: true; artifact: GeneratedVocabularyArtifact; isStale: boolean }
  | { ok: false; error: string };

/**
 * Reads and validates a generated-vocabulary JSON file. `isStale` is true
 * when the file's `generatorVersion` doesn't match the pipeline's current
 * {@link VOCABULARY_GENERATOR_VERSION} — a signal to regenerate before
 * trusting it, not a hard failure (the shape may still be compatible).
 */
export function loadGeneratedVocabularyFile(path: string): LoadGeneratedVocabularyResult {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    return { ok: false, error: `Could not read ${path}: ${error instanceof Error ? error.message : String(error)}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, error: `Invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}` };
  }

  const validated = validateGeneratedVocabularyArtifactShape(parsed);
  if (!validated.ok) {
    return { ok: false, error: `${path} does not match the GeneratedVocabularyArtifact schema: ${validated.error}` };
  }

  return {
    ok: true,
    artifact: validated.artifact,
    isStale: validated.artifact.generatorVersion !== VOCABULARY_GENERATOR_VERSION,
  };
}
