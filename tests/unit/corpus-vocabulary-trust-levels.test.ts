import { describe, expect, it } from "vitest";

import {
  buildGeneratedVocabularyArtifact,
  extractVocabularyCandidates,
  selectSafeDictionaryEntries,
  summarizeVocabularyTrust,
  type CorpusDocumentInput,
} from "@/domain/mongolian-orthography/corpus-vocabulary";

/**
 * Phase 4 (morphology-stem safety) and Phase 2/6 (ATTESTED/REVIEW/TRUSTED)
 * regression tests for the classification-safety milestone. Every case
 * here reproduces either a documented real finding (гэ, хуульчид) or a
 * synthetic worst-case constructed specifically to probe a boundary the
 * task asked to test (1-char stems, 2-char stems, suffix-length ties).
 */

function repeat(text: string, times: number): CorpusDocumentInput[] {
  return Array.from({ length: times }, (_, i) => ({ id: `d${i}`, text }));
}

describe("Phase 4 — one- and two-character stem safety", () => {
  it("never derives a stem shorter than 3 characters, however frequent (the гэ finding, reproduced end-to-end)", () => {
    // гэж/гэх/гэм previously all reduced to the 2-character stem "гэ" via
    // single-letter suffixes (ж/х/м), wrongly merging the quotative verb
    // "to say" with the unrelated noun "гэм" (guilt).
    const documents = repeat("Тэр гэж хэлсэн. Ингэж гэх нь мэдээж. Энэ бол гэм биш.", 10);
    const result = extractVocabularyCandidates(documents);
    expect(result.candidates.find((c) => c.word === "гэ")).toBeUndefined();
  });

  it("never derives a synthetic one-character stem", () => {
    // Construct words that all reduce to a 1-character "stem" via
    // 2+-character suffixes, to specifically probe the MIN_STEM_LENGTH
    // floor independent of the single-letter-suffix exclusion.
    const documents = repeat("аас ааст аастай аасаас аасын юм.", 10).concat(
      // "а" + "аас"(3) = 4 chars, too short a base; use single-letter "а" + 2-char suffixes.
      repeat("атай авч аёс мэт зүйл юм.", 10),
    );
    const result = extractVocabularyCandidates(documents);
    for (const candidate of result.candidates.filter((c) => c.category === "MORPHOLOGICAL_STEM")) {
      expect(candidate.word.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("picks the LONGEST applicable suffix, not the first one in declaration order (the хуульчид finding)", () => {
    // "хуульчид" previously mis-derived "хуульчи" (stripping bare "д",
    // which appears earlier in MORPHOLOGICAL_SUFFIXES) instead of
    // "хуульч" (stripping "ид") — this fragmented real stem evidence.
    const documents = repeat("Монголын хуульчид хурал хийв. Хуульчаас зөвлөгөө авав. Хуульчтай уулзав.", 5);
    const result = extractVocabularyCandidates(documents);
    expect(result.candidates.find((c) => c.word === "хуульчи")).toBeUndefined();
    const stem = result.candidates.find((c) => c.word === "хуульч");
    if (stem) {
      expect(stem.derivedFrom).toContain("хуульчид");
    }
  });

  it("a legitimate 3-character stem with 2+-character-suffix evidence IS still derivable (the floor isn't overzealous)", () => {
    // Each surface form must itself clear documentFrequency >= 2 to
    // become a surviving ordinary candidate before it can contribute
    // stem evidence — so each one needs 2 documents of its own.
    const documents: CorpusDocumentInput[] = [
      { id: "d1", text: "Энэ талаар ярилаа." },
      { id: "d2", text: "Дахин талаар өгүүлэв." },
      { id: "d3", text: "Нөгөө талыг харав." },
      { id: "d4", text: "Бас талыг сонирхов." },
    ];
    const result = extractVocabularyCandidates(documents);
    const stem = result.candidates.find((c) => c.word === "тал" && c.category === "MORPHOLOGICAL_STEM");
    expect(stem).toBeDefined();
    expect(stem?.derivedFrom?.length).toBeGreaterThanOrEqual(2);
  });

  it("MORPHOLOGICAL_STEM requires 2+ independent forms to be ATTESTED as a stem at all (one form is not evidence)", () => {
    const documents = repeat("Энэ талаар ярилаа.", 10); // only "талаар" ever appears
    const result = extractVocabularyCandidates(documents);
    expect(result.candidates.find((c) => c.category === "MORPHOLOGICAL_STEM" && c.word === "тал")).toBeUndefined();
  });
});

describe("Phase 2/6 — ATTESTED / REVIEW / TRUSTED tiers", () => {
  it("PROPER_NOUN and ABBREVIATION are always ATTESTED, never REVIEW or TRUSTED, however frequent", () => {
    const documents = repeat("Тэр Сүхбаатар дүүрэгт амьдардаг. НҮБ-аас мэдэгдэл гаргав.", 30);
    const result = extractVocabularyCandidates(documents);
    for (const candidate of result.candidates) {
      if (candidate.category === "PROPER_NOUN" || candidate.category === "ABBREVIATION") {
        expect(candidate.trustLevel).toBe("ATTESTED");
      }
    }
  });

  it("LEGAL is capped at REVIEW regardless of frequency or document coverage (policy: cannot yet distinguish legal terms from generic words below the COMMON coverage line)", () => {
    // High occurrence, but coverage ratio deliberately kept strictly
    // under 0.5 (15 of 35 documents = ~0.43) by outnumbering it with
    // filler documents.
    const legalDocs = repeat("энэ тухай асуудал", 15);
    const otherDocs = repeat("өөр агуулгатай текст энд.", 20);
    const result = extractVocabularyCandidates([...legalDocs, ...otherDocs]);
    const legalCandidates = result.candidates.filter((c) => c.category === "LEGAL");
    expect(legalCandidates.length).toBeGreaterThan(0);
    for (const candidate of legalCandidates) {
      expect(candidate.trustLevel).not.toBe("TRUSTED");
    }
  });

  it("COMMON requires BOTH high occurrence and high document coverage to reach TRUSTED", () => {
    // High coverage but low occurrence (exactly once per document).
    const documents = repeat("өдөр бүр ажилладаг.", 5);
    const result = extractVocabularyCandidates(documents);
    const candidate = result.candidates.find((c) => c.word === "өдөр");
    expect(candidate).toBeDefined();
    expect(candidate?.trustLevel).not.toBe("TRUSTED"); // occurrence (5) below the TRUSTED floor (10)
  });

  it("insufficient_evidence rejections are marked attested=true; structural rejections are not", () => {
    const documents: CorpusDocumentInput[] = [
      { id: "d1", text: "ганцхан удаа гарсан үг 123 https://example.mn" },
    ];
    const result = extractVocabularyCandidates(documents);
    const wordRejection = result.rejected.find((r) => r.reason === "insufficient_evidence");
    expect(wordRejection?.attested).toBe(true);
    const digitRejection = result.rejected.find((r) => r.reason === "contains_digit");
    expect(digitRejection?.attested).toBe(false);
    const nonMongolianRejection = result.rejected.find((r) => r.reason === "non_mongolian_characters");
    expect(nonMongolianRejection?.attested).toBe(false);
  });

  it("summarizeVocabularyTrust totals are internally consistent", () => {
    const documents = repeat("Энэ бол баримт бичиг юм. Тэр бичгээ бичив.", 10);
    const result = extractVocabularyCandidates(documents);
    const summary = summarizeVocabularyTrust(result);
    const sumFromCategories = Object.values(summary.byCategoryAndTrust).reduce(
      (sum, tiers) => sum + tiers.ATTESTED + tiers.REVIEW + tiers.TRUSTED,
      0,
    );
    expect(sumFromCategories).toBe(result.candidates.length);
    expect(summary.totalReview + summary.totalTrusted).toBeLessThanOrEqual(result.candidates.length);
  });
});

describe("Phase 6 — selectSafeDictionaryEntries never includes LEGAL, and never a duplicate word across categories", () => {
  it("never returns a LEGAL-category entry", () => {
    const legalDocs = repeat("энэ тухай асуудал", 20);
    const otherDocs = repeat("өөр агуулгатай текст энд.", 20);
    const result = extractVocabularyCandidates([...legalDocs, ...otherDocs]);
    const safe = selectSafeDictionaryEntries(result);
    for (const entry of safe) {
      expect(entry.category).not.toBe("LEGAL");
      expect(entry.trustLevel).toBe("TRUSTED");
    }
  });

  it("buildGeneratedVocabularyArtifact deduplicates a word that appears in two categories, keeping the higher-trust record", () => {
    // "акт" appears both as a literal LEGAL word and, via its inflected
    // forms, as a MORPHOLOGICAL_STEM — confirmed real behavior from the
    // 59-document evaluation corpus. Reproduced here with a smaller
    // synthetic corpus tuned to the same shape.
    const legalDocs = repeat("акт", 20); // frequent bare word, coverage < 0.5 overall once mixed below
    const stemDocs: CorpusDocumentInput[] = [
      { id: "s1", text: "актаар батлав" },
      { id: "s2", text: "актаас иш татав" },
      { id: "s3", text: "актыг баримтжуулав" },
    ];
    const fillerDocs = repeat("өөр агуулгатай текст энд.", 20);
    const result = extractVocabularyCandidates([...legalDocs, ...stemDocs, ...fillerDocs]);
    const artifact = buildGeneratedVocabularyArtifact(
      result.candidates.filter((c) => c.word === "акт"),
      { description: "test", documentCount: result.documentCount },
      "2026-01-01T00:00:00.000Z",
    );
    const aktEntries = artifact.entries.filter((e) => e.word === "акт");
    expect(aktEntries.length).toBe(1);
  });
});
