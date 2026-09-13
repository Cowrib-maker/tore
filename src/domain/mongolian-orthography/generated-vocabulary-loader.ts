/**
 * Node-only loader for a committed {@link GeneratedVocabularyArtifact}
 * (e.g. generated/legal-vocabulary.json) — reads the file and validates
 * its shape, but does not register anything: call
 * `registerGeneratedVocabulary` from dictionary.ts yourself with the
 * result if/when you actually want a build or server bootstrap to merge
 * it in. Nothing in dictionary.ts or suggestions.ts imports this file,
 * so it introduces no filesystem dependency into the request path or the
 * default test run — it only exists for whoever explicitly wires it up.
 *
 * Kept separate from corpus-vocabulary.ts, which is filesystem-free by
 * design (see its module doc comment) so it can run in any JS
 * environment, not just Node.
 */

import { readFileSync } from "node:fs";

import type {
  GeneratedVocabularyArtifact,
  GeneratedVocabularyEntry,
} from "@/domain/mongolian-orthography/corpus-vocabulary";
import { VOCABULARY_GENERATOR_VERSION } from "@/domain/mongolian-orthography/corpus-vocabulary";

const VALID_CATEGORIES = new Set(["COMMON", "LEGAL", "MORPHOLOGICAL_STEM"]);

function isValidEntry(value: unknown): value is GeneratedVocabularyEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.word === "string" &&
    entry.word.length >= 2 &&
    typeof entry.category === "string" &&
    VALID_CATEGORIES.has(entry.category) &&
    typeof entry.occurrenceCount === "number" &&
    typeof entry.documentFrequency === "number"
  );
}

function isValidArtifact(value: unknown): value is GeneratedVocabularyArtifact {
  if (typeof value !== "object" || value === null) return false;
  const artifact = value as Record<string, unknown>;
  return (
    artifact.schemaVersion === 1 &&
    typeof artifact.generatorVersion === "number" &&
    typeof artifact.generatedAt === "string" &&
    typeof artifact.source === "object" &&
    artifact.source !== null &&
    Array.isArray(artifact.entries) &&
    artifact.entries.every(isValidEntry)
  );
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

  if (!isValidArtifact(parsed)) {
    return { ok: false, error: `${path} does not match the GeneratedVocabularyArtifact schema.` };
  }

  return { ok: true, artifact: parsed, isStale: parsed.generatorVersion !== VOCABULARY_GENERATOR_VERSION };
}
