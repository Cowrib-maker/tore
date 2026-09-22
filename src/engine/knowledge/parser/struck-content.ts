/**
 * Detects legalinfo.mn's own convention for marking a repealed provision
 * inline: a `<s>...</s>` (struck-through) span around the article/paragraph
 * heading. Regex over raw HTML, not the parsed tree, because the shared
 * LegalInfoKnowledgeParser deliberately strips all markup (including `<s>`)
 * before producing KnowledgeArticle[] — by the time an article reaches the
 * parser's output, there is nothing left to detect it by.
 *
 * A near-identical pair of functions already exists at
 * src/infrastructure/legal-web-research/legalinfo-article-extraction.ts,
 * protecting the OFFICIAL_WEB retrieval-fallback tier's cache-write
 * boundary. This copy exists rather than importing that one because engine/
 * must not depend on infrastructure/ (dependency direction). Both must stay
 * behaviorally identical — see legalinfo-article-extraction.ts's own doc
 * comment, which already documents this exact gap on the ingestion side.
 *
 * Tag coverage (evidence from the real local corpus, 2026-09-22): a survey
 * of all locally-archived documents found legalinfo.mn uses TWO distinct
 * strikethrough tags for the same purpose — the modern `<s>` (26 files) and
 * the legacy `<strike>` (22 files, disjoint from the <s> set) — both wrapping
 * whole struck provisions at the same severity (confirmed: real examples
 * include whole sub-paragraphs like "21.1.2....", "22.1.8...."). A `<del>`
 * tag also appears, but in exactly one file wrapping a single character —
 * not evidence of a real repeal-marking convention, so it is deliberately
 * not treated as a struck-through signal here. CSS
 * `text-decoration:line-through` was checked separately and never appears
 * without an accompanying `<s>`/`<strike>` tag in this corpus, so it is not
 * a distinct pattern requiring its own detection.
 *
 * Locator depth: struck spans are not always exactly two levels deep
 * ("40.1") — real examples go three levels ("21.1.2"). The paragraph
 * pattern below captures the full dotted locator, and isArticleNumberStruck
 * checks every ancestor prefix, not just the top-level article.
 */

const STRUCK_HEADING_PATTERN =
  /<(?:s|strike)[^>]*>\s*(\d+(?:\.\d+)?)\s*(?:дугаар|дүгээр)\s*зүйл/giu;
const STRUCK_PARAGRAPH_PATTERN = /<(?:s|strike)[^>]*>\s*(\d+(?:\.\d+)+)\s*\./g;

export function collectStruckLocators(html: string): Set<string> {
  const struck = new Set<string>();
  for (const pattern of [STRUCK_HEADING_PATTERN, STRUCK_PARAGRAPH_PATTERN]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
      struck.add(match[1]!);
    }
  }
  return struck;
}

/**
 * True when `articleNumber` (e.g. "40", "40.1", or the deeper "40.1.2") is
 * struck through — either directly, or because any ancestor locator (a
 * containing paragraph, or the top-level article heading) is struck. A
 * repealed article's or paragraph's children are repealed with it.
 */
export function isArticleNumberStruck(
  articleNumber: string,
  struckLocators: ReadonlySet<string>,
): boolean {
  const segments = articleNumber.split(".");
  for (let depth = segments.length; depth >= 1; depth -= 1) {
    if (struckLocators.has(segments.slice(0, depth).join("."))) {
      return true;
    }
  }
  return false;
}
