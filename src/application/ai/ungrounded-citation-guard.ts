/**
 * Post-generation guard: the model may only cite provisions that retrieval
 * actually verified this turn. Persisted citation records already come from
 * verified authorities only; this closes the remaining gap — free text in
 * the answer that names an article nobody verified.
 *
 * It never rewrites or deletes model text (we cannot know what is wrong with
 * it); it appends an unmissable, deterministic Mongolian notice. Pure and
 * deterministic: same input, same output.
 */

export const INSUFFICIENT_EVIDENCE_MN =
  "Энэ дүгнэлтийг одоогийн баримт, эх сурвалжаар хангалттай тогтоох боломжгүй.";

/**
 * Quantity words that may follow a number: «5 хоног», «3 удаа», «зүйлийн 5 хувь». A number followed by one of these is an amount, not an
 * article. Suffixed forms are matched too («хоногийн», «хувийг», «өдрийн»), so a few stems that lose a vowel/soft sign before a suffix are listed twice («хувь/хуви», «өдөр/өдр»).
 */
const QUANTITY_AFTER_NUMBER = "(?:хувь|хуви|хоног|удаа|жил|сар|өдөр|өдр|минут|секунд|цаг|төгрөг|мянга|сая|тэрбум|%|₮)";

/**
 * Explicit article citations only:
 *   «12-р зүйл», «17 дугаар/дүгээр зүйл» (also «17 дугаар зүйлийн 1 дэх хэсэг» → 17, the 1 is a paragraph),
 *   «зүйлийн 21 заалт», and a heading-style «Зүйл 12.» / «Зүйл 12-т» (the number ends the phrase or takes a case suffix).
 * Deliberately NOT citations: counts and amounts («3 зүйл», «зүйл 5 хоногийн дотор», «зүйлийн 5 хувь», «Нэг зүйл 3 удаа»), a bare list item
 * («2 дахь зүйл нь…», «дараах 3 зүйлийг»). A real citation the patterns miss is only left unchecked; a quantity must never raise a warning.
 */
const ARTICLE_PATTERNS: readonly RegExp[] = [
  /(\d{1,3})\s*-\s*р\s+зүйл/giu,
  /(\d{1,3})\s*(?:дугаар|дүгээр)\s+зүйл/giu,
  // «зүйлийн 12» names an article — but in «17 дугаар зүйлийн 1 дэх хэсэг» the 1 is a paragraph.
  new RegExp(
    "(?<!\\d\\s*(?:-\\s*р|дугаар|дүгээр)\\s+)зүйлийн\\s+(\\d{1,3})(?![\\d.]|\\s*(?:дэх|дахь|-р)|\\s*" + QUANTITY_AFTER_NUMBER + ")",
    "giu",
  ),
  // «Зүйл 12.», «зүйл 12-т», «(зүйл 12)»: the number must end the phrase; «зүйл 5 хоногийн» continues with a word, so it is not matched.
  /(?<!\p{L})зүйл\s+(\d{1,3})(?=\s*(?:$|[.,;:!?)\]»"'])|-\p{L})/gimu,
];

export function extractArticleMentions(text: string): number[] {
  const found = new Set<number>();
  for (const re of ARTICLE_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const n = Number(m[1]);
      if (Number.isInteger(n) && n > 0) found.add(n);
    }
  }
  return [...found].sort((a, b) => a - b);
}

export type GroundingAuthority = { article?: string | null; locator?: string | null };

/** Article number of a verified authority: explicit field first, else the `art-<n>[/p-<m>]` locator. */
function articleNumber(a: GroundingAuthority): number | null {
  const fromLocator = /^art-(\d{1,3})/i.exec(a.locator?.trim() ?? "")?.[1];
  const m = /\d{1,3}/.exec(a.article ?? fromLocator ?? "");
  return m ? Number(m[0]) : null;
}

export type CitationGuardResult = { content: string; ungrounded: number[] };

export function guardUngroundedCitations(
  content: string,
  verified: ReadonlyArray<GroundingAuthority> | undefined,
): CitationGuardResult {
  const mentioned = extractArticleMentions(content);
  if (mentioned.length === 0) return { content, ungrounded: [] };
  const grounded = new Set<number>();
  for (const a of verified ?? []) {
    const n = articleNumber(a);
    if (n !== null) grounded.add(n);
  }
  const ungrounded = mentioned.filter((n) => !grounded.has(n));
  if (ungrounded.length === 0) return { content, ungrounded: [] };
  const list = ungrounded.map((n) => `${n}-р зүйл`).join(", ");
  const notice =
    `\n\n⚠️ Анхааруулга: энэ хариунд дурдсан ${list} нь TORE-ийн баталгаатай эх сурвалжаар баталгаажаагүй байна. ` +
    "Албан ёсны эх сурвалжаас (legalinfo.mn) шалгалгүйгээр ашиглахгүй байна уу. " +
    INSUFFICIENT_EVIDENCE_MN;
  return { content: content + notice, ungrounded };
}
