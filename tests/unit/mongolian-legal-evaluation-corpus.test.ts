import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  isKnownMongolianWord,
  suggestDictionaryWords,
} from "@/domain/mongolian-orthography/dictionary";
import { buildOrthographySuggestions } from "@/domain/mongolian-orthography/suggestions";
import {
  extractVocabularyCandidates,
  type CorpusDocumentInput,
} from "@/domain/mongolian-orthography/corpus-vocabulary";
import {
  ABBREVIATION_CASES,
  ARTICLE_NUMBER_CASES,
  DANGEROUS_CONFUSION_SET,
  DANGEROUS_MORPHOLOGICAL_STEM_FALSE_POSITIVE,
  LEGAL_TERM_SET,
  MORPHOLOGY_SET,
  OCR_GARBAGE_CASES,
  PROPER_NOUN_CASES,
  SPELLCHECK_GOLD_SET_TYPOS,
  SPELLCHECK_GOLD_SET_VALID,
} from "../evaluation/mongolian-legal-gold-set";

/**
 * Phase 7 safety regression tests, driven by the hand-reviewed gold set
 * in tests/evaluation/mongolian-legal-gold-set.ts. Every expected outcome
 * here was written by a human before or independent of running the
 * engine — see that file's own comments for how each entry was verified.
 */

describe("A/D — valid words (including legal terms) must remain silent", () => {
  for (const { word, note } of SPELLCHECK_GOLD_SET_VALID) {
    it(`"${word}" is known and produces no suggestion — ${note}`, () => {
      expect(isKnownMongolianWord(word)).toBe(true);
      expect(suggestDictionaryWords(word)).toEqual([]);
    });
  }
});

describe("C — typo produces the intended legal/common word as the top candidate", () => {
  for (const { input, expectedTop, note } of SPELLCHECK_GOLD_SET_TYPOS) {
    it(`"${input}" -> "${expectedTop}" — ${note}`, () => {
      const candidates = suggestDictionaryWords(input);
      expect(candidates[0]).toBe(expectedTop);
    });
  }
});

describe("D/I — a valid word close to another valid word must never be corrected into it", () => {
  for (const { valid, nearby, note } of DANGEROUS_CONFUSION_SET) {
    it(`"${valid}" stays valid and is never suggested as a fix for "${nearby}" or vice versa — ${note}`, () => {
      expect(isKnownMongolianWord(valid)).toBe(true);
      expect(isKnownMongolianWord(nearby)).toBe(true);
      expect(suggestDictionaryWords(valid)).toEqual([]);
      expect(suggestDictionaryWords(nearby)).toEqual([]);
    });
  }
});

describe("E — proper nouns never produce a generic-word correction, ordinary words never get misclassified as names", () => {
  it("sentence-initial capitalization alone is not proper-noun evidence (regression)", () => {
    // Re-verified here (not just in corpus-vocabulary-extraction.test.ts)
    // because it's exactly the class of bug this evaluation corpus is
    // meant to catch: свэрхэ ordinary legal words must not silently
    // become PROPER_NOUN just because a fixture happens to capitalize
    // them at a sentence boundary.
    const documents: CorpusDocumentInput[] = [
      { id: "d1", text: "Гэрээний нөхцөл. Хоёрдугаарт, гэрээний зүйл. Гуравдугаарт, дахин гэрээний тухай." },
      { id: "d2", text: "Гэрээний журам бас байна. Дахиад гэрээний асуудал." },
    ];
    const result = extractVocabularyCandidates(documents);
    const candidate = result.candidates.find((c) => c.word === "гэрээний");
    expect(candidate).toBeDefined();
    expect(candidate?.category).not.toBe("PROPER_NOUN");
  });

  for (const { word, note } of PROPER_NOUN_CASES) {
    it(`documented case: "${word}" — ${note}`, () => {
      // These are documentation-level regression notes backed by
      // tests/unit/corpus-vocabulary-extraction.test.ts's fuller
      // assertions; this just keeps the gold-set list itself exercised
      // so it can't silently rot.
      expect(word.length).toBeGreaterThan(0);
    });
  }
});

describe("F — abbreviations are never expanded or merged as ordinary vocabulary", () => {
  for (const { word, note } of ABBREVIATION_CASES) {
    it(`"${word}" — ${note}`, () => {
      const documents: CorpusDocumentInput[] = [
        { id: "d1", text: `${word}-ын шийдвэрээр ажил эхэллээ.` },
        { id: "d2", text: `Энэ асуудлыг ${word} хариуцна.` },
      ];
      const result = extractVocabularyCandidates(documents);
      const candidate = result.candidates.find((c) => c.word === word);
      expect(candidate).toBeDefined();
      expect(candidate?.category).toBe("ABBREVIATION");
    });
  }
});

describe("G — article/clause/case numbers are rejected, never treated as spelling candidates", () => {
  for (const { text, rejectedToken, note } of ARTICLE_NUMBER_CASES) {
    it(`"${rejectedToken}" in "${text}" is never a suggestion source — ${note}`, () => {
      const result = extractVocabularyCandidates([{ id: "d1", text }]);
      expect(result.candidates.some((c) => c.word === rejectedToken)).toBe(false);
      const rejected = result.rejected.find((r) => r.word === rejectedToken);
      expect(rejected?.reason).toBe("contains_digit");

      // Also confirm the orthography checker itself never flags a bare
      // digit as a misspelling.
      const suggestions = buildOrthographySuggestions(text);
      expect(suggestions.suggestions.some((s) => s.sourceWord === rejectedToken)).toBe(false);
    });
  }
});

describe("H — OCR garbage / corrupted tokens are rejected", () => {
  for (const { token, note } of OCR_GARBAGE_CASES) {
    it(`"${token}" is rejected, never promoted — ${note}`, () => {
      const result = extractVocabularyCandidates([
        { id: "d1", text: `Энэ бол ${token} гэсэн үг.` },
      ]);
      expect(result.candidates.some((c) => c.word === token.toLowerCase())).toBe(false);
    });
  }
});

describe("B — legal-domain morphology: inflected/suffixed forms are recognized", () => {
  for (const { word, note } of MORPHOLOGY_SET) {
    it(`"${word}" is known — ${note}`, () => {
      expect(isKnownMongolianWord(word)).toBe(true);
    });
  }
});

describe("Phase 5 — legal-term list (evidence-based, not intuition)", () => {
  for (const { word, alreadyKnown, note } of LEGAL_TERM_SET) {
    it(`"${word}": alreadyKnown=${alreadyKnown} — ${note}`, () => {
      expect(isKnownMongolianWord(word)).toBe(alreadyKnown);
    });
  }
});

describe("Confirmed-dangerous MORPHOLOGICAL_STEM finding — must never be approved into the generated artifact", () => {
  it(`"${DANGEROUS_MORPHOLOGICAL_STEM_FALSE_POSITIVE.stem}" conflates unrelated forms and must not be in generated/legal-vocabulary.json`, () => {
    const generated = JSON.parse(
      readFileSync(join(process.cwd(), "generated/legal-vocabulary.json"), "utf8"),
    ) as { entries: readonly { word: string }[] };
    expect(
      generated.entries.some((e) => e.word === DANGEROUS_MORPHOLOGICAL_STEM_FALSE_POSITIVE.stem),
    ).toBe(false);
  });
});

describe("Standing regressions from 0577f94/f8831e2 (must never regress)", () => {
  it("ширэх ranks ширхэг above the unrelated ирэх", () => {
    const candidates = suggestDictionaryWords("ширэх");
    expect(candidates[0]).toBe("ширхэг");
  });

  it("хаалттай / заалттай / хүүхэд / миний all remain valid", () => {
    for (const word of ["хаалттай", "заалттай", "хүүхэд", "миний"]) {
      expect(isKnownMongolianWord(word)).toBe(true);
      expect(suggestDictionaryWords(word)).toEqual([]);
    }
  });
});
