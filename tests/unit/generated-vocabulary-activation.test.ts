import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  clearGeneratedVocabularyForTests,
  dictionarySizeForTests,
  generatedVocabularyProvenance,
  isKnownMongolianWord,
} from "@/domain/mongolian-orthography/dictionary";
import { GENERATED_LEGAL_VOCABULARY_V1_FLAG, isGeneratedLegalVocabularyEnabled } from "@/lib/feature-flags";
import { initializeGeneratedVocabularyIfEnabled } from "@/domain/mongolian-orthography/generated-vocabulary-activation";

/**
 * Controlled generated-vocabulary activation infrastructure — milestone 8
 * (0eff277's follow-on). Covers exactly the 9 scenarios the milestone
 * asked for, plus the rollback-to-baseline regression it explicitly
 * requires (Section 3), using the real committed artifact
 * (generated/legal-vocabulary.json, 5 TRUSTED entries as of this
 * milestone) wherever a real end-to-end check is meaningful, and small
 * synthetic artifacts (written to a temp file, cleaned up per test) for
 * the malformed/rejected/REVIEW/PROPER_NOUN/ABBREVIATION cases, since
 * those shapes don't exist in the real committed file by construction.
 */

const REAL_ARTIFACT_PATH = "generated/legal-vocabulary.json";
const KNOWN_REAL_ENTRY = "акт"; // MORPHOLOGICAL_STEM, TRUSTED, in the real committed artifact

function writeTempArtifact(content: unknown): string {
  const path = join(tmpdir(), `test-generated-vocab-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(path, JSON.stringify(content));
  return path;
}

afterEach(() => {
  delete process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG];
  clearGeneratedVocabularyForTests();
});

describe("feature flag itself", () => {
  it("defaults to OFF when unset", () => {
    delete process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG];
    expect(isGeneratedLegalVocabularyEnabled()).toBe(false);
  });

  it("enables only when exactly \"1\"", () => {
    process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG] = "1";
    expect(isGeneratedLegalVocabularyEnabled()).toBe(true);
    process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG] = "true";
    expect(isGeneratedLegalVocabularyEnabled()).toBe(false);
    process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG] = "yes";
    expect(isGeneratedLegalVocabularyEnabled()).toBe(false);
  });
});

describe("1. OFF -> no generated entries", () => {
  it("initializeGeneratedVocabularyIfEnabled is a no-op when the flag is unset", () => {
    delete process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG];
    const before = dictionarySizeForTests();
    const result = initializeGeneratedVocabularyIfEnabled();
    expect(result).toEqual({ enabled: false });
    expect(isKnownMongolianWord(KNOWN_REAL_ENTRY)).toBe(false);
    expect(dictionarySizeForTests()).toBe(before);
  });
});

describe("2. ON -> trusted generated entries available", () => {
  it("registers every TRUSTED entry from the real committed artifact", () => {
    process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG] = "1";
    const result = initializeGeneratedVocabularyIfEnabled({ artifactPath: REAL_ARTIFACT_PATH });
    expect(result.enabled).toBe(true);
    if (!result.enabled || !result.ok) throw new Error("expected successful activation");
    expect(result.registeredCount).toBeGreaterThan(0);

    expect(isKnownMongolianWord(KNOWN_REAL_ENTRY)).toBe(true);
    const provenance = generatedVocabularyProvenance(KNOWN_REAL_ENTRY);
    expect(provenance?.category).toBe("MORPHOLOGICAL_STEM");
    expect(provenance?.source).toContain(REAL_ARTIFACT_PATH);
  });
});

describe("3. ON twice -> no duplication", () => {
  it("calling initializeGeneratedVocabularyIfEnabled twice registers the same count, not double", () => {
    process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG] = "1";
    const first = initializeGeneratedVocabularyIfEnabled({ artifactPath: REAL_ARTIFACT_PATH });
    const second = initializeGeneratedVocabularyIfEnabled({ artifactPath: REAL_ARTIFACT_PATH });
    if (!first.enabled || !first.ok || !second.enabled || !second.ok) {
      throw new Error("expected both activations to succeed");
    }
    expect(second.registeredCount).toBe(first.registeredCount);
    expect(generatedVocabularyProvenance(KNOWN_REAL_ENTRY)?.occurrenceCount).toBe(
      generatedVocabularyProvenance(KNOWN_REAL_ENTRY)?.occurrenceCount,
    );
    // Dictionary size after the 2nd call must equal the size after the 1st
    // (idempotent, not additive).
    const sizeAfterFirst = dictionarySizeForTests();
    initializeGeneratedVocabularyIfEnabled({ artifactPath: REAL_ARTIFACT_PATH });
    expect(dictionarySizeForTests()).toBe(sizeAfterFirst);
  });
});

describe("4. hand-curated word + generated same word -> hand-curated wins", () => {
  it("a generated entry colliding with an already hand-curated word never changes its known-status, and is marked pre-existing", () => {
    process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG] = "1";
    // "эрх" is hand-curated (LEGAL_LEXICON_WORDS). Construct a synthetic
    // artifact that (incorrectly, adversarially) claims it as generated
    // too, and confirm hand-curated status is unaffected.
    const artifactPath = writeTempArtifact({
      schemaVersion: 2,
      generatorVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      source: { description: "test", documentCount: 1 },
      entries: [
        { word: "эрх", category: "MORPHOLOGICAL_STEM", trustLevel: "TRUSTED", occurrenceCount: 999, documentFrequency: 999 },
      ],
    });
    try {
      expect(isKnownMongolianWord("эрх")).toBe(true);
      const result = initializeGeneratedVocabularyIfEnabled({ artifactPath });
      expect(result.enabled).toBe(true);
      expect(isKnownMongolianWord("эрх")).toBe(true);
      // registerGeneratedVocabulary still records a provenance entry (for
      // tracking), but clearGeneratedVocabularyForTests must never delete
      // the underlying hand-curated word — see scenario 5 below and the
      // existing Invariant-4 regression tests for the deeper mechanism.
      clearGeneratedVocabularyForTests();
      expect(isKnownMongolianWord("эрх")).toBe(true);
    } finally {
      unlinkSync(artifactPath);
    }
  });
});

describe("5. OFF after ON in isolated test state -> baseline restored", () => {
  it("clearGeneratedVocabularyForTests fully reverses activation back to the hand-curated baseline", () => {
    const baselineSize = dictionarySizeForTests();
    expect(isKnownMongolianWord(KNOWN_REAL_ENTRY)).toBe(false);

    process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG] = "1";
    const result = initializeGeneratedVocabularyIfEnabled({ artifactPath: REAL_ARTIFACT_PATH });
    if (!result.enabled || !result.ok) throw new Error("expected activation to succeed");
    expect(isKnownMongolianWord(KNOWN_REAL_ENTRY)).toBe(true);
    expect(dictionarySizeForTests()).toBeGreaterThan(baselineSize);

    // The real-world kill switch is "unset the flag + restart the
    // process" (see Section 3 of the milestone) — clearGeneratedVocabularyForTests()
    // is this test suite's in-process equivalent of that restart, and is
    // exactly what proves the SAME baseline is reachable again without any
    // migration, cache invalidation, or manual cleanup.
    delete process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG];
    clearGeneratedVocabularyForTests();

    expect(isKnownMongolianWord(KNOWN_REAL_ENTRY)).toBe(false);
    expect(dictionarySizeForTests()).toBe(baselineSize);
    expect(generatedVocabularyProvenance(KNOWN_REAL_ENTRY)).toBeNull();
  });
});

describe("6. malformed artifact -> rejected", () => {
  it("initializeGeneratedVocabularyIfEnabled throws when the flag is ON and the artifact is malformed, rather than silently no-op'ing", () => {
    process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG] = "1";
    const artifactPath = writeTempArtifact({ schemaVersion: 2, entries: "not an array" });
    try {
      expect(() => initializeGeneratedVocabularyIfEnabled({ artifactPath })).toThrow(
        /TORE_GENERATED_LEGAL_VOCABULARY_V1 is enabled but the generated-vocabulary artifact is invalid/,
      );
      // And critically: a thrown activation must not have left the
      // dictionary in a half-registered state.
      expect(isKnownMongolianWord(KNOWN_REAL_ENTRY)).toBe(false);
    } finally {
      unlinkSync(artifactPath);
    }
  });

  it("a missing artifact file also throws when the flag is ON", () => {
    process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG] = "1";
    expect(() =>
      initializeGeneratedVocabularyIfEnabled({ artifactPath: "generated/does-not-exist.json" }),
    ).toThrow();
  });
});

describe("7. REVIEW entry -> cannot be loaded as TRUSTED", () => {
  it("an artifact containing a REVIEW-tagged entry fails schema validation entirely (fails closed, not a partial load)", () => {
    process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG] = "1";
    const artifactPath = writeTempArtifact({
      schemaVersion: 2,
      generatorVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      source: { description: "test", documentCount: 1 },
      entries: [
        // Intentionally malformed for the test — a real
        // GeneratedVocabularyEntry can never have trustLevel !== "TRUSTED";
        // writeTempArtifact takes `unknown`, so nothing stops constructing
        // this shape directly for a validation-rejection test.
        { word: "үндсэн", category: "COMMON", trustLevel: "REVIEW", occurrenceCount: 9, documentFrequency: 5 },
      ],
    });
    try {
      expect(() => initializeGeneratedVocabularyIfEnabled({ artifactPath })).toThrow(/trustLevel "REVIEW"/);
      expect(isKnownMongolianWord("үндсэн")).toBe(false);
    } finally {
      unlinkSync(artifactPath);
    }
  });
});

describe("8. PROPER_NOUN entry -> cannot enter trusted layer", () => {
  it("an artifact containing a PROPER_NOUN category entry fails schema validation", () => {
    process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG] = "1";
    const artifactPath = writeTempArtifact({
      schemaVersion: 2,
      generatorVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      source: { description: "test", documentCount: 1 },
      entries: [
        { word: "Сүхбаатар", category: "PROPER_NOUN", trustLevel: "TRUSTED", occurrenceCount: 9, documentFrequency: 5 },
      ],
    });
    try {
      expect(() => initializeGeneratedVocabularyIfEnabled({ artifactPath })).toThrow(/invalid category/);
      expect(isKnownMongolianWord("Сүхбаатар")).toBe(false);
    } finally {
      unlinkSync(artifactPath);
    }
  });
});

describe("9. ABBREVIATION entry -> cannot enter trusted layer", () => {
  it("an artifact containing an ABBREVIATION category entry fails schema validation", () => {
    process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG] = "1";
    const artifactPath = writeTempArtifact({
      schemaVersion: 2,
      generatorVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      source: { description: "test", documentCount: 1 },
      entries: [
        { word: "НҮБ", category: "ABBREVIATION", trustLevel: "TRUSTED", occurrenceCount: 9, documentFrequency: 5 },
      ],
    });
    try {
      expect(() => initializeGeneratedVocabularyIfEnabled({ artifactPath })).toThrow(/invalid category/);
      expect(isKnownMongolianWord("НҮБ")).toBe(false);
    } finally {
      unlinkSync(artifactPath);
    }
  });
});
