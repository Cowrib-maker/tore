import { afterEach, describe, expect, it } from "vitest";

import {
  clearGeneratedVocabularyForTests,
  generatedVocabularyProvenance,
  isKnownMongolianWord,
  registerGeneratedVocabulary,
  suggestDictionaryWords,
} from "@/domain/mongolian-orthography/dictionary";
import { loadGeneratedVocabularyFile } from "@/domain/mongolian-orthography/generated-vocabulary-loader";
import { buildOrthographySuggestions } from "@/domain/mongolian-orthography/suggestions";

const ARTIFACT_PATH = "generated/legal-vocabulary.json";

describe("generated vocabulary — inactive by default", () => {
  it("the committed artifact's words are NOT known before anything registers them", () => {
    // This is the core safety property: merely having generated/
    // legal-vocabulary.json checked into the repo must not change
    // runtime behavior. Something has to explicitly call
    // registerGeneratedVocabulary() first.
    expect(isKnownMongolianWord("үндсэн")).toBe(false);
    expect(isKnownMongolianWord("дүгээр")).toBe(false);
  });
});

describe("loadGeneratedVocabularyFile", () => {
  it("loads and validates the real committed artifact", () => {
    const result = loadGeneratedVocabularyFile(ARTIFACT_PATH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.artifact.schemaVersion).toBe(1);
    expect(result.artifact.entries.length).toBeGreaterThan(0);
    expect(result.isStale).toBe(false);
  });

  it("fails cleanly on a missing file instead of throwing", () => {
    const result = loadGeneratedVocabularyFile("generated/does-not-exist.json");
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed artifact instead of loading garbage", () => {
    // A file that parses as JSON but doesn't match the schema (e.g.
    // missing entries, wrong schemaVersion) must be refused, not
    // silently half-loaded.
    const fs = require("node:fs") as typeof import("node:fs");
    const os = require("node:os") as typeof import("node:os");
    const path = require("node:path") as typeof import("node:path");
    const tmpFile = path.join(os.tmpdir(), `bad-vocab-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify({ schemaVersion: 2, entries: "not an array" }));
    try {
      const result = loadGeneratedVocabularyFile(tmpFile);
      expect(result.ok).toBe(false);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

describe("registerGeneratedVocabulary — once explicitly activated", () => {
  afterEach(() => {
    clearGeneratedVocabularyForTests();
  });

  it("makes the real artifact's words known, with correct provenance, and behaves exactly like a hand-curated word", () => {
    const loaded = loadGeneratedVocabularyFile(ARTIFACT_PATH);
    if (!loaded.ok) throw new Error(loaded.error);
    registerGeneratedVocabulary(loaded.artifact.entries, { source: "legal-vocabulary.json" });

    expect(isKnownMongolianWord("үндсэн")).toBe(true);
    expect(isKnownMongolianWord("дүгээр")).toBe(true);
    expect(suggestDictionaryWords("үндсэн")).toEqual([]);

    // Category reflects whatever the artifact currently records for this
    // word (LEGAL or COMMON, depending on the corpus run that produced
    // it) — the important assertion is provenance exists and is
    // attributed to this source, not a specific frozen category value
    // that would make this test brittle against every artifact refresh.
    const provenance = generatedVocabularyProvenance("үндсэн");
    expect(provenance).toMatchObject({ source: "legal-vocabulary.json" });
    expect(["COMMON", "LEGAL"]).toContain(provenance?.category);
    expect(generatedVocabularyProvenance("хууль")).toBeNull(); // hand-curated, never "generated"
  });

  it("dangerous-candidate regression: standing regression scenarios are unaffected by registering generated vocabulary", () => {
    const loaded = loadGeneratedVocabularyFile(ARTIFACT_PATH);
    if (!loaded.ok) throw new Error(loaded.error);
    registerGeneratedVocabulary(loaded.artifact.entries);

    // The exact regression set called out for this milestone.
    const candidates = suggestDictionaryWords("ширэх");
    expect(candidates[0]).toBe("ширхэг");
    for (const word of ["хаалттай", "заалттай", "хүүхэд", "миний"]) {
      expect(isKnownMongolianWord(word)).toBe(true);
      expect(suggestDictionaryWords(word)).toEqual([]);
    }
    // Valid suffix forms from the previous milestone's fixes.
    for (const word of ["хуульчид", "явлаа", "явна", "хуульчаар"]) {
      expect(isKnownMongolianWord(word)).toBe(true);
    }

    // The criminal-law statute paste must still produce zero spelling
    // suggestions — registering two constitutional-law words must not
    // change fuzzy-matching behavior for unrelated criminal-law text.
    const statute =
      "Шүүх гэмт хэрэг үйлдсэн нь тогтоогдсон, гэм буруугаа хүлээн зөвшөөрсөн өсвөр насны хүний гэмт хэрэг үйлдсэн нөхцөл байдал, учруулсан хохирол, хор уршгийн шинж чанар, хувийн байдал, мөрдөн шалгах ажиллагааг шуурхай явуулж гэмт хэргийг нотлоход дэмжлэг үзүүлсэн байдлыг харгалзан дараах байдлаар эрүүгийн хариуцлагыг хөнгөрүүлж, эсхүл эрүүгийн хариуцлагаас чөлөөлж болно.";
    expect(buildOrthographySuggestions(statute).spellingCount).toBe(0);
  });

  it("legal vocabulary does not override general spelling safety: a typo of a generated word is still ranked/gated by confidence, not blindly accepted", () => {
    const loaded = loadGeneratedVocabularyFile(ARTIFACT_PATH);
    if (!loaded.ok) throw new Error(loaded.error);
    registerGeneratedVocabulary(loaded.artifact.entries);

    // "үндсэн" -> typo "үндсн" (dropped a vowel). Must not be silently
    // accepted as known, and if a correction is offered it must be the
    // real word, not something unrelated.
    expect(isKnownMongolianWord("үндсн")).toBe(false);
    const candidates = suggestDictionaryWords("үндсн");
    if (candidates.length > 0) {
      expect(candidates).toContain("үндсэн");
    }
  });

  it("re-registering an already hand-curated word is a safe no-op and cleanup never erases hand-curated data", () => {
    // Simulates a mistake (or a future larger corpus re-discovering an
    // already-known word) rather than testing a real artifact entry.
    expect(isKnownMongolianWord("хууль")).toBe(true);
    registerGeneratedVocabulary([
      { word: "хууль", category: "LEGAL", occurrenceCount: 999, documentFrequency: 999 },
    ]);
    expect(isKnownMongolianWord("хууль")).toBe(true);

    clearGeneratedVocabularyForTests();

    // The critical assertion: hand-curated "хууль" must survive cleanup
    // even though it was also (redundantly) registered as generated.
    expect(isKnownMongolianWord("хууль")).toBe(true);
  });

  it("registering is idempotent: registering the same entries twice changes nothing further", () => {
    const loaded = loadGeneratedVocabularyFile(ARTIFACT_PATH);
    if (!loaded.ok) throw new Error(loaded.error);
    const expectedOccurrence = loaded.artifact.entries.find((e) => e.word === "үндсэн")?.occurrenceCount;
    registerGeneratedVocabulary(loaded.artifact.entries);
    registerGeneratedVocabulary(loaded.artifact.entries);
    expect(isKnownMongolianWord("үндсэн")).toBe(true);
    // The second registration must not double-count — provenance still
    // reflects the artifact's own recorded occurrence count, not 2x it.
    expect(generatedVocabularyProvenance("үндсэн")?.occurrenceCount).toBe(expectedOccurrence);
  });

  it("cleanup fully reverses a normal registration", () => {
    expect(isKnownMongolianWord("үндсэн")).toBe(false);
    registerGeneratedVocabulary([
      { word: "үндсэн", category: "COMMON", occurrenceCount: 6, documentFrequency: 2 },
    ]);
    expect(isKnownMongolianWord("үндсэн")).toBe(true);
    clearGeneratedVocabularyForTests();
    expect(isKnownMongolianWord("үндсэн")).toBe(false);
    expect(generatedVocabularyProvenance("үндсэн")).toBeNull();
  });
});
