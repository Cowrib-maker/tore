/**
 * Deterministic classification of a Mongolian statute's entry-into-force
 * ("хүчин төгөлдөр болох") clause — the article (almost always the last
 * one) that states when the law itself starts to apply.
 *
 * Evidence (2026-09-23, real 105-document local corpus): sampled every
 * document's final articles and found exactly three safe, distinguishable
 * templates plus a residual "recognized vocabulary but no safe template"
 * bucket. Counted against the full corpus:
 *
 *   FIXED_DATE               44/105 — an explicit calendar date directly
 *                             in the clause ("2004 оны 1 дүгээр сарын
 *                             1-ний өдрөөс эхлэн дагаж мөрдөнө").
 *   CROSS_DOCUMENT_REFERENCE 14/105 — effect deferred to ANOTHER named
 *                             law's own effective date ("Энэ хуулийг
 *                             Хөрөнгө оруулалтын тухай хууль хүчин
 *                             төгөлдөр болсон өдрөөс эхлэн дагаж
 *                             мөрдөнө"). That second law's effective date
 *                             is not resolved by this function — doing so
 *                             safely needs a second hop this module does
 *                             not attempt (see the module using this one).
 *   SELF_ADOPTION_DATE       2/105  — effect starts on this law's OWN
 *                             adoption date ("Энэ хууль батлагдсан
 *                             өдрөөс хүчин төгөлдөр болно"). The caller
 *                             must supply that adoption date separately —
 *                             this function only classifies the clause.
 *   UNRECOGNIZED              rest  — contains entry-into-force
 *                             vocabulary but not a template this module
 *                             has verified real evidence for (e.g. a
 *                             traditional lunar-calendar date, a
 *                             typo'd digit, or no clause at all). Never
 *                             guessed — evidenceText is preserved either
 *                             way so a human can review it.
 *
 * A FIXED_DATE requires the date to be immediately followed by the
 * ablative "-аас/-ээс/-оос" ("since/from") case ending on "өдөр" (day) —
 * "... 19-ний өдрөөс ... дагаж мөрдөнө" — never a bare "... 19-ний өдөр
 * баталсан ..." (adopted), which describes when a REFERENCED law was
 * adopted, not this clause's own effective date. Conflating the two
 * would silently misattribute a date — see CROSS_DOCUMENT_REFERENCE's
 * real examples, several of which embed exactly this kind of "баталсан"
 * date for a different law.
 */

export const EntryIntoForceKind = {
  FIXED_DATE: "FIXED_DATE",
  SELF_ADOPTION_DATE: "SELF_ADOPTION_DATE",
  CROSS_DOCUMENT_REFERENCE: "CROSS_DOCUMENT_REFERENCE",
  UNRECOGNIZED: "UNRECOGNIZED",
} as const;
export type EntryIntoForceKind = (typeof EntryIntoForceKind)[keyof typeof EntryIntoForceKind];

export type EntryIntoForceEvidence =
  | { kind: "FIXED_DATE"; date: string; evidenceText: string }
  | { kind: "SELF_ADOPTION_DATE"; evidenceText: string }
  | { kind: "CROSS_DOCUMENT_REFERENCE"; referencedLawText: string; evidenceText: string }
  | { kind: "UNRECOGNIZED"; evidenceText: string | null };

const MONTH_DAY =
  /(\d{4})\s*оны\s*(\d{1,2})\s*(?:дугаар|дүгээр)\s*сарын\s*(\d{1,2})[-–]?\s*(?:ны|ний)?\s*/u;

const FIXED_DATE_PATTERN = new RegExp(
  MONTH_DAY.source + String.raw`өдрөөс\s*(?:эхлэн\s*)?(?:дагаж\s*мөрдөнө|хүчин\s*төгөлдөр\s*болно)`,
  "iu",
);

const SELF_ADOPTION_PATTERN = /Энэ\s*хууль(?:ийг)?\s+батлагдсан\s+өдрөөс/iu;

const CROSS_DOCUMENT_REFERENCE_PATTERN =
  /Энэ\s*хуулийг\s+(.+?\s*хууль(?:\s*\/[^/]*\/)?)\s*хүчин\s*төгөлдөр\s*болсон\s*өдрөөс\s*(?:эхлэн\s*)?дагаж\s*мөрдөнө/iu;

export function classifyEntryIntoForceClause(text: string): EntryIntoForceEvidence {
  const trimmed = text.trim();
  if (!trimmed) {
    return { kind: "UNRECOGNIZED", evidenceText: null };
  }

  const fixedMatch = FIXED_DATE_PATTERN.exec(trimmed);
  if (fixedMatch) {
    const [full, year, month, day] = fixedMatch;
    return {
      kind: "FIXED_DATE",
      date: `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`,
      evidenceText: full,
    };
  }

  const selfAdoptionMatch = SELF_ADOPTION_PATTERN.exec(trimmed);
  if (selfAdoptionMatch) {
    return { kind: "SELF_ADOPTION_DATE", evidenceText: selfAdoptionMatch[0] };
  }

  const crossRefMatch = CROSS_DOCUMENT_REFERENCE_PATTERN.exec(trimmed);
  if (crossRefMatch) {
    return {
      kind: "CROSS_DOCUMENT_REFERENCE",
      referencedLawText: crossRefMatch[1]!.trim(),
      evidenceText: crossRefMatch[0],
    };
  }

  return { kind: "UNRECOGNIZED", evidenceText: trimmed };
}
