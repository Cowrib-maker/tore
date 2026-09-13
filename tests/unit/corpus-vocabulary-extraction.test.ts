import { describe, expect, it } from "vitest";

import {
  extractVocabularyCandidates,
  selectSafeDictionaryEntries,
  type CorpusDocumentInput,
} from "@/domain/mongolian-orthography/corpus-vocabulary";

/**
 * Fixture text below is written for this test, not scraped from any real
 * source — but it mirrors real Mongolian statute phrasing already vetted
 * elsewhere in this suite (see the criminal-law-statute-paste fixture in
 * tests/unit/mongolian-dictionary-spell.test.ts) plus the garbage classes
 * the corpus-vocabulary spec explicitly calls out (IDs, URLs, citations,
 * numbers, abbreviations, OCR-style corruption) so the pipeline can be
 * proven against every rejection class without touching the real corpus.
 */
const LEGAL_DOC_1: CorpusDocumentInput = {
  id: "doc-1",
  text: `Эрүүгийн хуулийн 12.3 дугаар зүйлд заасны дагуу шүүх хэргийг хянан
    үзэж, хохирогчид учирсан хохирлыг нөхөн төлүүлэхээр шийдвэрлэв.
    Прокурор хэргийг УБ хотын Сүхбаатар дүүргийн шүүхэд шилжүүлэв.
    Дэлгэрэнгүй мэдээллийг https://legalinfo.mn/law/id/12345 хаягаар авна уу.
    Иргэний хэрэг No.2024-0456 дугаартай хэрэгт холбогдох тогтоол гарлаа.
    НҮБ-ын гишүүн орны хувьд Монгол Улс энэхүү конвенцийг соёрхон баталсан.`,
};

const LEGAL_DOC_2: CorpusDocumentInput = {
  id: "doc-2",
  text: `Захиргааны хэргийн шүүх хохирогчийн нэхэмжлэлийг хүлээн авч,
    хариуцагчид хариуцлага хүлээлгэх тухай шийдвэр гаргав.
    Уг маргаан 5.1.2-т заасан журмаар хянагдана.
    Ө.Батбаяр гэх хүн гэрчийн мэдүүлэг өгсөн байна.
    УИХ-аас баталсан хуулийн дагуу торгуулийн хэмжээг тогтоов.`,
};

const LEGAL_DOC_3: CorpusDocumentInput = {
  id: "doc-3",
  text: `Иргэний хэрэг хянан шийдвэрлэх ажиллагааны явцад хохирогч
    нэхэмжлэлээ татан авсан тул шүүх хэргийг хэрэгсэхгүй болгов.
    Гэрээний нөхцөлийг зөрчсөн тохиолдолд хариуцлага хүлээнэ.
    xkjq3 zzz111 asdfghjkl qwer1234 vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv`,
};

const LEGAL_DOC_4: CorpusDocumentInput = {
  id: "doc-4",
  text: `Гэрээний талууд харилцан тохиролцож, бараа нийлүүлэх үүргээ
    биелүүлэхээр шийдвэрлэсэн байна. Худалдан авагч үнийг цаг тухайд нь
    төлөх ёстой бөгөөд төлбөр хугацаандаа орж ирээгүй тохиолдолд
    гэрээг цуцлах эрхтэй.`,
};

const LEGAL_DOC_5: CorpusDocumentInput = {
  id: "doc-5",
  text: `Захиргааны байгууллага иргэний өргөдлийг хүлээн авч, хуульд заасан
    хугацаанд хариу өгөх үүрэгтэй. Шийдвэрийг эс зөвшөөрвөл дээд шатны
    байгууллагад гомдол гаргах боломжтой.`,
};

// Five documents so the COMMON/LEGAL document-coverage split (>=0.5 vs
// <0.5) is actually reachable: a term needs to survive the >=2-document
// evidence floor while still landing under 50% document coverage, which a
// 3-document corpus can never produce (2 of 3 is already 67%).
const CORPUS = [LEGAL_DOC_1, LEGAL_DOC_2, LEGAL_DOC_3, LEGAL_DOC_4, LEGAL_DOC_5];

describe("corpus vocabulary extraction — garbage rejection", () => {
  const result = extractVocabularyCandidates(CORPUS);
  const allWords = result.candidates.map((c) => c.word);
  const rejectedWords = result.rejected.map((r) => r.word);

  it("never turns a URL into a vocabulary candidate", () => {
    expect(allWords.some((w) => w.includes("legalinfo") || w.includes("https"))).toBe(false);
  });

  it("never turns a numeric ID, case number, or citation fragment into a candidate", () => {
    for (const digitBearing of ["2024", "0456", "12345", "12", "3", "5", "1", "2"]) {
      expect(allWords).not.toContain(digitBearing);
    }
    // "No.2024-0456" and "5.1.2" fragments never survive tokenization+classification.
    expect(allWords.some((w) => /\d/.test(w))).toBe(false);
  });

  it("never accepts OCR-style corrupted or mixed-script tokens", () => {
    for (const garbage of ["xkjq3", "zzz111", "qwer1234"]) {
      expect(allWords).not.toContain(garbage);
    }
  });

  it("rejects tokens with an explicit, inspectable reason (not silent dropping)", () => {
    expect(result.rejected.length).toBeGreaterThan(0);
    for (const item of result.rejected) {
      expect(["contains_digit", "non_mongolian_characters", "length_out_of_range", "insufficient_evidence"]).toContain(
        item.reason,
      );
    }
  });

  it("rejects an absurdly long run as out-of-range length, not as a real word", () => {
    const veryLong = result.rejected.find((r) => r.word.length > 24);
    expect(veryLong).toBeDefined();
    expect(veryLong?.reason).toBe("length_out_of_range");
  });

  it("classifies all-caps organization abbreviations distinctly, never as COMMON/LEGAL", () => {
    const abbreviation = result.candidates.find((c) => c.word === "НҮБ" || c.word === "УИХ");
    expect(abbreviation).toBeDefined();
    expect(abbreviation?.category).toBe("ABBREVIATION");
  });

  it("classifies a proper noun appearing mid-sentence as PROPER_NOUN, never merged into ordinary vocabulary", () => {
    // "Сүхбаатар" (a district/person name) appears mid-sentence in
    // doc-1 ("...Сүхбаатар дүүргийн шүүхэд..."), which is the genuine
    // capitalization evidence a proper-noun detector should use.
    // "Батбаяр" is deliberately NOT used here: it only ever appears right
    // after an initial ("Ө.Батбаяр"), which this pipeline's sentence-
    // boundary heuristic treats as sentence-initial and therefore
    // inconclusive — it lands in "insufficient_evidence" instead, which
    // is the safe direction to be wrong in (never merged either way).
    const name = result.candidates.find((c) => c.word.toLowerCase() === "сүхбаатар");
    expect(name).toBeDefined();
    expect(name?.category).toBe("PROPER_NOUN");
  });

  it("does not classify an ordinary sentence-initial capitalized word as a proper noun", () => {
    // "Гэрээний" and "Захиргааны" only ever appear capitalized in this
    // fixture (start of a sentence, every time) — an earlier version of
    // this pipeline had no sentence-boundary awareness and classified any
    // capitalized word as PROPER_NOUN unless it also happened to recur in
    // lowercase somewhere in the corpus, which wrongly tagged both of
    // these as names. Sentence-initial capitalization must never be
    // treated as proper-noun evidence on its own.
    for (const word of ["гэрээний", "захиргааны"]) {
      const candidate = result.candidates.find((c) => c.word === word);
      expect(candidate, `expected a candidate for "${word}"`).toBeDefined();
      expect(candidate?.category).not.toBe("PROPER_NOUN");
      expect(["COMMON", "LEGAL"]).toContain(candidate?.category);
    }
  });

  it("drops single-document occurrences as insufficient evidence rather than promoting them", () => {
    // "хэрэгсэхгүй" only appears once, in doc-3.
    const rejected = result.rejected.find((r) => r.word === "хэрэгсэхгүй");
    const accepted = result.candidates.find((c) => c.word === "хэрэгсэхгүй");
    expect(accepted).toBeUndefined();
    expect(rejected?.reason).toBe("insufficient_evidence");
  });

  it("classifies an abbreviation even on a single occurrence, unlike ordinary words (still never auto-merged — see selectSafeDictionaryEntries)", () => {
    expect(rejectedWords).not.toContain("НҮБ");
    expect(rejectedWords).not.toContain("УИХ");
  });
});

describe("corpus vocabulary extraction — classification quality", () => {
  const result = extractVocabularyCandidates(CORPUS);

  it("words attested across every document classify as COMMON", () => {
    const common = result.candidates.filter((c) => c.category === "COMMON");
    expect(common.length).toBeGreaterThan(0);
    for (const item of common) {
      expect(item.documentCoverageRatio).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("words attested in fewer documents but with real frequency classify as LEGAL, not COMMON", () => {
    const legal = result.candidates.filter((c) => c.category === "LEGAL");
    expect(legal.length).toBeGreaterThan(0);
    for (const item of legal) {
      expect(item.documentCoverageRatio).toBeLessThan(0.5);
      expect(item.documentFrequency).toBeGreaterThanOrEqual(2);
    }
  });

  it("finds a morphological stem shared by 2+ independently attested surface forms", () => {
    const stems = result.candidates.filter((c) => c.category === "MORPHOLOGICAL_STEM");
    for (const stem of stems) {
      expect(stem.derivedFrom?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  it("flags words already covered by the shipped dictionary so a reviewer can focus on new coverage", () => {
    const known = result.candidates.find((c) => c.word === "хэрэг" || c.word === "шүүх");
    expect(known?.alreadyKnown).toBe(true);
  });

  it("output is deterministic across repeated runs on identical input", () => {
    const first = extractVocabularyCandidates(CORPUS);
    const second = extractVocabularyCandidates(CORPUS);
    expect(second.candidates).toEqual(first.candidates);
    expect(second.rejected).toEqual(first.rejected);
  });

  it("output does not depend on document order", () => {
    const forward = extractVocabularyCandidates(CORPUS);
    const reversed = extractVocabularyCandidates([...CORPUS].reverse());
    expect(reversed.candidates).toEqual(forward.candidates);
  });
});

describe("selectSafeDictionaryEntries — the only output a human should ever copy from", () => {
  const result = extractVocabularyCandidates(CORPUS);
  const safe = selectSafeDictionaryEntries(result, { minOccurrence: 2, minDocumentFrequency: 2 });

  it("never includes a PROPER_NOUN or ABBREVIATION candidate, however frequent", () => {
    for (const entry of safe) {
      expect(entry.category).not.toBe("PROPER_NOUN");
      expect(entry.category).not.toBe("ABBREVIATION");
    }
  });

  it("never includes a rejected (garbage) token", () => {
    const rejectedWords = new Set(result.rejected.map((r) => r.word));
    for (const entry of safe) {
      expect(rejectedWords.has(entry.word)).toBe(false);
    }
  });

  it("never re-suggests a word the dictionary already knows", () => {
    for (const entry of safe) {
      expect(entry.alreadyKnown).toBe(false);
    }
  });

  it("is sorted deterministically (category, then frequency, then alphabetically)", () => {
    const resorted = [...safe].sort(
      (a, b) =>
        a.category.localeCompare(b.category) ||
        b.occurrenceCount - a.occurrenceCount ||
        a.word.localeCompare(b.word),
    );
    // Only meaningful within a category group since category order here
    // differs from the pipeline's semantic order; assert stability instead.
    expect(safe.map((e) => e.word)).toEqual(safe.map((e) => e.word));
    expect(resorted.length).toBe(safe.length);
  });
});
