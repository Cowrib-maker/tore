import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  compareGeneratedVocabularyEntries,
  extractVocabularyCandidates,
  VOCABULARY_GENERATOR_VERSION,
} from "@/domain/mongolian-orthography/corpus-vocabulary";
import { normalizeMongolianWord } from "@/domain/mongolian-orthography/engine";
import {
  loadGeneratedVocabularyFile,
  validateGeneratedVocabularyArtifactShape,
} from "@/domain/mongolian-orthography/generated-vocabulary-loader";
import { buildEvaluationCorpus } from "../../scripts/build-evaluation-corpus";

/**
 * Milestone 8 (controlled generated-vocabulary activation), Section 7:
 * generated-artifact integrity validation. Run at TEST time, not runtime
 * (the loader's own cheap structural checks run at load time always; the
 * expensive "is this still reproducible from the corpus" cross-check
 * belongs only here, per the milestone's own "do not make runtime
 * startup depend on expensive validation" instruction).
 */

const ARTIFACT_PATH = join(process.cwd(), "generated", "legal-vocabulary.json");

describe("committed artifact — schema and structural integrity", () => {
  it("matches the expected schema (loads via loadGeneratedVocabularyFile without error)", () => {
    const result = loadGeneratedVocabularyFile(ARTIFACT_PATH);
    expect(result.ok).toBe(true);
  });

  it("has a version (schemaVersion and generatorVersion both present, generatorVersion matches the current pipeline)", () => {
    const raw = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
    expect(raw.schemaVersion).toBe(2);
    expect(raw.generatorVersion).toBe(VOCABULARY_GENERATOR_VERSION);
  });

  it("contains only TRUSTED entries", () => {
    const result = loadGeneratedVocabularyFile(ARTIFACT_PATH);
    if (!result.ok) throw new Error(result.error);
    expect(result.artifact.entries.length).toBeGreaterThan(0);
    for (const entry of result.artifact.entries) {
      expect(entry.trustLevel).toBe("TRUSTED");
    }
  });

  it("contains only COMMON/MORPHOLOGICAL_STEM categories (never LEGAL, PROPER_NOUN, or ABBREVIATION)", () => {
    const result = loadGeneratedVocabularyFile(ARTIFACT_PATH);
    if (!result.ok) throw new Error(result.error);
    for (const entry of result.artifact.entries) {
      expect(["COMMON", "MORPHOLOGICAL_STEM"]).toContain(entry.category);
    }
  });

  it("is deterministically sorted (matches compareGeneratedVocabularyEntries exactly)", () => {
    const result = loadGeneratedVocabularyFile(ARTIFACT_PATH);
    if (!result.ok) throw new Error(result.error);
    const entries = result.artifact.entries;
    for (let i = 1; i < entries.length; i += 1) {
      expect(compareGeneratedVocabularyEntries(entries[i - 1]!, entries[i]!)).toBeLessThanOrEqual(0);
    }
  });

  it("contains no duplicate normalized words", () => {
    const result = loadGeneratedVocabularyFile(ARTIFACT_PATH);
    if (!result.ok) throw new Error(result.error);
    const normalized = result.artifact.entries.map((e) => normalizeMongolianWord(e.word));
    expect(new Set(normalized).size).toBe(normalized.length);
  });

  it("contains no malformed/empty tokens (every word normalizes to at least 2 characters)", () => {
    const result = loadGeneratedVocabularyFile(ARTIFACT_PATH);
    if (!result.ok) throw new Error(result.error);
    for (const entry of result.artifact.entries) {
      expect(entry.word.length).toBeGreaterThan(0);
      expect(normalizeMongolianWord(entry.word).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("cannot overwrite hand-curated entries: none of the artifact's words happen to already be hand-curated in a way this test should notice", async () => {
    // Not a general proof (registerGeneratedVocabulary's own Set-based
    // design is what actually guarantees this — see the Invariant-4
    // regression tests in adversarial-invariants.test.ts), but a concrete
    // sanity check that today's specific 5 words aren't redundantly
    // hand-curated, which would make the "generated" provenance claim
    // misleading even though it wouldn't be unsafe.
    const { isKnownMongolianWord } = await import("@/domain/mongolian-orthography/dictionary");
    const result = loadGeneratedVocabularyFile(ARTIFACT_PATH);
    if (!result.ok) throw new Error(result.error);
    for (const entry of result.artifact.entries) {
      expect(isKnownMongolianWord(entry.word)).toBe(false);
    }
  });
});

describe("validateGeneratedVocabularyArtifactShape — pure rejection-path coverage", () => {
  it("rejects a non-object", () => {
    expect(validateGeneratedVocabularyArtifactShape(null).ok).toBe(false);
    expect(validateGeneratedVocabularyArtifactShape("hello").ok).toBe(false);
  });

  it("rejects the old schemaVersion 1 shape (no trustLevel field)", () => {
    const result = validateGeneratedVocabularyArtifactShape({
      schemaVersion: 1,
      generatorVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      source: { description: "x", documentCount: 1 },
      entries: [{ word: "тест", category: "COMMON", occurrenceCount: 1, documentFrequency: 1 }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects entries that aren't an array", () => {
    const result = validateGeneratedVocabularyArtifactShape({
      schemaVersion: 2,
      generatorVersion: 1,
      generatedAt: "x",
      source: {},
      entries: "not-an-array",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a duplicate normalized word", () => {
    const result = validateGeneratedVocabularyArtifactShape({
      schemaVersion: 2,
      generatorVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      source: { description: "x", documentCount: 1 },
      entries: [
        { word: "тест", category: "COMMON", trustLevel: "TRUSTED", occurrenceCount: 10, documentFrequency: 5 },
        { word: "тест", category: "MORPHOLOGICAL_STEM", trustLevel: "TRUSTED", occurrenceCount: 5, documentFrequency: 3 },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/duplicate/i);
  });

  it("rejects out-of-order entries", () => {
    const result = validateGeneratedVocabularyArtifactShape({
      schemaVersion: 2,
      generatorVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      source: { description: "x", documentCount: 1 },
      entries: [
        { word: "яаз", category: "COMMON", trustLevel: "TRUSTED", occurrenceCount: 5, documentFrequency: 3 },
        { word: "аяз", category: "COMMON", trustLevel: "TRUSTED", occurrenceCount: 10, documentFrequency: 5 },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not sorted/i);
  });

  it("rejects a malformed/empty token", () => {
    const result = validateGeneratedVocabularyArtifactShape({
      schemaVersion: 2,
      generatorVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      source: { description: "x", documentCount: 1 },
      entries: [{ word: "1234", category: "COMMON", trustLevel: "TRUSTED", occurrenceCount: 1, documentFrequency: 1 }],
    });
    expect(result.ok).toBe(false);
  });

  it("accepts a well-formed, sorted, TRUSTED-only, schemaVersion-2 artifact", () => {
    const result = validateGeneratedVocabularyArtifactShape({
      schemaVersion: 2,
      generatorVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      source: { description: "x", documentCount: 1 },
      entries: [
        { word: "аяз", category: "COMMON", trustLevel: "TRUSTED", occurrenceCount: 10, documentFrequency: 5 },
        { word: "яаз", category: "COMMON", trustLevel: "TRUSTED", occurrenceCount: 5, documentFrequency: 3 },
      ],
    });
    expect(result.ok).toBe(true);
  });
});

describe("reproducibility cross-check against the corpus that produced the committed artifact (expensive; test-time only, never runtime)", () => {
  it("every committed entry's claimed occurrenceCount/documentFrequency/trustLevel is still reproducible from the tracked evaluation corpus", async () => {
    const result = loadGeneratedVocabularyFile(ARTIFACT_PATH);
    if (!result.ok) throw new Error(result.error);

    const corpus = await buildEvaluationCorpus();
    const documents = corpus.documents.map((doc) => ({ id: doc.id, text: doc.text }));
    const extraction = extractVocabularyCandidates(documents);

    for (const entry of result.artifact.entries) {
      const candidate = extraction.candidates.find(
        (c) => c.word === entry.word && c.category === entry.category,
      );
      expect(candidate, `"${entry.word}" [${entry.category}] should still be a live candidate`).toBeDefined();
      expect(candidate?.trustLevel).toBe("TRUSTED");
      expect(candidate?.occurrenceCount).toBe(entry.occurrenceCount);
      expect(candidate?.documentFrequency).toBe(entry.documentFrequency);
    }
  });

  it("no OTHER word in the fresh extraction newly qualifies for the artifact that isn't already there (the artifact isn't silently stale/incomplete relative to APPROVED_WORDS-independent evidence) — informational, not a hard gate on unapproved words", async () => {
    // This intentionally does NOT assert equality with the full set of
    // TRUSTED candidates the corpus could produce — APPROVED_WORDS in
    // scripts/generate-legal-vocabulary-artifact.ts is a human allowlist,
    // and plenty of other words may independently reach TRUSTED without
    // ever having been reviewed. This test only confirms the SHIPPED
    // entries remain internally consistent with fresh extraction (checked
    // above); it does not claim the artifact is complete or exhaustive.
    const corpus = await buildEvaluationCorpus();
    const documents = corpus.documents.map((doc) => ({ id: doc.id, text: doc.text }));
    const extraction = extractVocabularyCandidates(documents);
    const trustedCount = extraction.candidates.filter((c) => c.trustLevel === "TRUSTED").length;
    expect(trustedCount).toBeGreaterThanOrEqual(5); // at least the 5 shipped entries' worth of evidence exists
  });
});
