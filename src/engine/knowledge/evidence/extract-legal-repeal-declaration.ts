/**
 * Deterministic extraction for ONE narrow, highly-structured document
 * pattern: a Mongolian law whose entire purpose is a repeal declaration.
 * Evidence (2026-09-22, real local corpus): 17 of 105 real ingested
 * documents have a title ending in "ХҮЧИНГҮЙ БОЛСОНД ТООЦОХ ТУХАЙ" and, in
 * every single one, article 1 follows the identical template:
 *
 *   "{date} баталсан {TARGET LAW NAME}-ийг хүчингүй болсонд тооцсугай."
 *
 * This is a template match, not general prose mining — it is deliberately
 * NOT applied to arbitrary article text anywhere in the corpus (see
 * REFERS_TO's 634 occurrences across 54 documents, none of which are safe
 * to turn into edges this way). The caller must gate this function to
 * only documents whose own title matches the declaration pattern, so a
 * stray sentence elsewhere that happens to use similar words never
 * produces a fabricated relation.
 *
 * Confidence: EXPLICIT. The source document's sole legal purpose (both its
 * title and its only substantive article) is this declaration — there is
 * no ambiguity about what relation type applies, unlike a REFERS_TO mention
 * embedded in unrelated prose.
 */

export type LegalRepealDeclaration = {
  /** Verbatim target law name as printed, before any corpus resolution. */
  targetLawName: string;
  /** ISO date (YYYY-MM-DD) when the target law was originally enacted, if parseable. */
  targetEnactedDate: string | null;
  /** The exact sentence this was extracted from. */
  evidenceText: string;
};

const MONGOLIAN_MONTHS: Record<string, string> = {
  "1": "01", "2": "02", "3": "03", "4": "04", "5": "05", "6": "06",
  "7": "07", "8": "08", "9": "09", "10": "10", "11": "11", "12": "12",
};

const DATE_PREFIX =
  /(\d{4})\s*оны\s*(\d{1,2})\s*(?:дугаар|дүгээр)\s*сарын\s*(\d{1,2})\s*[-–]?\s*(?:ны|ний)?\s*өдөр\s*баталсан\s+/u;

/**
 * Two alternatives, tried in order (bracket-qualified first — it is the
 * more specific shape and must not be short-circuited by the plainer
 * one). A "/Шинэчилсэн найруулга/" (revised-edition) bracket is part of
 * the target law's DISTINGUISHING name, not grammatical noise — real
 * evidence: this corpus contains multiple laws sharing the same base
 * title across amendments (e.g. several "Шүүх байгуулах тухай" vintages),
 * so dropping the bracket would make two different real laws collide
 * under one ambiguous name during corpus resolution.
 */
const WITH_EDITION_BRACKET = new RegExp(
  DATE_PREFIX.source + String.raw`(.+?\s*хууль\s*\/[^/]+\/)\s*-?ийг\s+хүчингүй\s+болсонд\s+тооцсугай`,
  "u",
);
const PLAIN = new RegExp(
  DATE_PREFIX.source + String.raw`(.+?)\s*хуулийг\s+хүчингүй\s+болсонд\s+тооцсугай`,
  "u",
);

/** True when a document's own title is this narrow declaration pattern — the required gate before calling extractLegalRepealDeclaration. */
export function isRepealDeclarationTitle(title: string): boolean {
  return /хүчингүй\s+болсонд\s+тооцох\s+тухай\s*$/iu.test(title.trim());
}

/**
 * Extracts the repeal declaration from article 1's text of a document
 * already confirmed (by the caller, via isRepealDeclarationTitle) to be
 * this narrow pattern. Returns null if the expected sentence isn't found
 * — never guesses a partial match.
 */
export function extractLegalRepealDeclaration(
  articleOneText: string,
): LegalRepealDeclaration | null {
  const match =
    WITH_EDITION_BRACKET.exec(articleOneText) ?? PLAIN.exec(articleOneText);
  if (!match) {
    return null;
  }
  const [full, year, month, day, rawName] = match;
  const targetLawName = rawName!.trim();
  if (!targetLawName) {
    return null;
  }
  const monthPadded = MONGOLIAN_MONTHS[month!] ?? month!.padStart(2, "0");
  const dayPadded = day!.padStart(2, "0");
  return {
    targetLawName,
    targetEnactedDate: `${year}-${monthPadded}-${dayPadded}`,
    evidenceText: full,
  };
}
