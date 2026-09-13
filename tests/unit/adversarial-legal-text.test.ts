import { describe, expect, it } from "vitest";

import { isKnownMongolianWord, suggestDictionaryWords } from "@/domain/mongolian-orthography/dictionary";
import { buildOrthographySuggestions } from "@/domain/mongolian-orthography/suggestions";

/**
 * Milestone 7 (adversarial orthography evaluation), Section 3:
 * legal-text adversarial cases using the task's own term list:
 * зүйл, хэсэг, заалт, дугаар, тогтоол, шийдвэр, захирамж, нэхэмжлэл,
 * яллагдагч, хохирогч, сэжигтэн, прокурор, өмгөөлөгч, шүүх, мөрдөн,
 * нотлох баримт, эрх, үүрэг.
 *
 * These are TEST EXAMPLES ONLY, per the task's explicit instruction:
 * "These are test examples, not permission to add them to the
 * dictionary." Three of them (захирамж, яллагдагч, сэжигтэн) are
 * confirmed genuinely absent from both the hand-curated dictionary and
 * the evaluation corpus (see UNKNOWN_WORDS in the adversarial gold set) —
 * they are deliberately tested here as UNKNOWN, not silently added.
 */

const LEGAL_TERM_LIST = [
  "зүйл", "хэсэг", "заалт", "дугаар", "тогтоол", "шийдвэр", "захирамж",
  "нэхэмжлэл", "яллагдагч", "хохирогч", "сэжигтэн", "прокурор", "өмгөөлөгч",
  "шүүх", "мөрдөн", "нотлох", "баримт", "эрх", "үүрэг",
] as const;

const KNOWN_TERMS = new Set([
  "зүйл", "хэсэг", "заалт", "дугаар", "тогтоол", "шийдвэр", "нэхэмжлэл",
  "хохирогч", "прокурор", "өмгөөлөгч", "шүүх", "мөрдөн", "нотлох", "баримт", "эрх", "үүрэг",
]);
const CONFIRMED_ABSENT_TERMS = new Set(["захирамж", "яллагдагч", "сэжигтэн"]);

describe("legal term list — isolated-word status (confirmed, not assumed)", () => {
  for (const term of LEGAL_TERM_LIST) {
    if (KNOWN_TERMS.has(term)) {
      it(`"${term}" is known in isolation`, () => {
        expect(isKnownMongolianWord(term)).toBe(true);
      });
    } else if (CONFIRMED_ABSENT_TERMS.has(term)) {
      it(`"${term}" is genuinely unknown in isolation (not silently added by this milestone)`, () => {
        expect(isKnownMongolianWord(term)).toBe(false);
      });
    }
  }

  it("every term in LEGAL_TERM_LIST is accounted for as either known or confirmed-absent (no silent third state)", () => {
    for (const term of LEGAL_TERM_LIST) {
      expect(KNOWN_TERMS.has(term) || CONFIRMED_ABSENT_TERMS.has(term)).toBe(true);
    }
  });
});

/**
 * Realistic legal sentences built from the term list. Each sentence is
 * checked for two things: (1) no known term inside it is ever flagged as
 * a misspelling (a false positive inside real legal prose is exactly what
 * this milestone is stress-testing for), and (2) a genuinely-absent term
 * embedded in an otherwise well-formed sentence still produces no
 * fabricated high-confidence "correction" — silence is the required,
 * safe behavior for a term this dictionary has no evidence for.
 */
describe("legal term list inside realistic sentences — no false positives on known terms", () => {
  const sentences = [
    "Эрүүгийн хуулийн тухайн зүйл, хэсэг, заалтад заасны дагуу шүүх хэргийг хянан хэлэлцэв.",
    "Прокурор мөрдөн байцаах ажиллагааны явцад олж авсан нотлох баримтыг танилцуулав.",
    "Өмгөөлөгч нэхэмжлэлийн шаардлагыг үндэслэлгүй гэж үзэж, шүүхэд тайлбар гаргав.",
    "Шүүхийн тогтоол, шийдвэрт заасан эрх, үүргийг талууд биелүүлэх үүрэгтэй.",
    "Дугаар 5 дугаартай хэрэгт холбогдох баримтыг мөрдөн шалгах явцад бэхжүүлэв.",
  ];

  for (const sentence of sentences) {
    it(`no known legal term is flagged in: "${sentence}"`, () => {
      const suggestions = buildOrthographySuggestions(sentence);
      const flaggedSourceWords = new Set(suggestions.suggestions.map((s) => s.sourceWord.toLowerCase()));
      for (const term of KNOWN_TERMS) {
        if (sentence.toLowerCase().includes(term)) {
          expect(flaggedSourceWords.has(term)).toBe(false);
        }
      }
    });
  }

  it("захирамж embedded in a realistic sentence stays silent (unknown, but no fabricated guess)", () => {
    const sentence = "Засгийн газрын захирамж гарсны дараа хэрэгжилтийг хангав.";
    expect(isKnownMongolianWord("захирамж")).toBe(false);
    const suggestions = buildOrthographySuggestions(sentence);
    const flaggedForZahiramj = suggestions.suggestions.find((s) => s.sourceWord.toLowerCase() === "захирамж");
    // Either it's not flagged at all (silent-on-unknown), or if flagged,
    // it must carry NO fabricated top suggestion that isn't itself a real
    // dictionary word — never a guess invented for this milestone.
    if (flaggedForZahiramj) {
      for (const candidate of flaggedForZahiramj.candidates ?? []) {
        expect(isKnownMongolianWord(candidate)).toBe(true);
      }
    }
  });

  it("яллагдагч and сэжигтэн in a realistic criminal-procedure sentence never receive a fabricated correction", () => {
    const sentence = "Яллагдагч болон сэжигтэн нарын мэдүүлгийг шүүх хуралдаанд хэлэлцэв.";
    for (const term of ["яллагдагч", "сэжигтэн"]) {
      expect(isKnownMongolianWord(term)).toBe(false);
      const candidates = suggestDictionaryWords(term);
      for (const candidate of candidates) {
        expect(isKnownMongolianWord(candidate)).toBe(true);
      }
    }
    // The sentence itself must still process without throwing and without
    // corrupting known-term recognition elsewhere in the same sentence.
    const suggestions = buildOrthographySuggestions(sentence);
    expect(suggestions.suggestions.some((s) => s.sourceWord.toLowerCase() === "шүүх")).toBe(false);
  });
});
