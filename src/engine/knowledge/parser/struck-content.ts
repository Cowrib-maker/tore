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
 */

const STRUCK_HEADING_PATTERN = /<s[^>]*>\s*(\d+(?:\.\d+)?)\s*(?:дугаар|дүгээр)\s*зүйл/giu;
const STRUCK_PARAGRAPH_PATTERN = /<s[^>]*>\s*(\d+\.\d+)\s*\./g;

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
 * True when `articleNumber` (e.g. "40" or a dotted paragraph "40.1") is
 * struck through — either directly, or because its parent article's own
 * heading is struck (a repealed article's paragraphs are repealed with it).
 */
export function isArticleNumberStruck(
  articleNumber: string,
  struckLocators: ReadonlySet<string>,
): boolean {
  if (struckLocators.has(articleNumber)) {
    return true;
  }
  const base = articleNumber.split(".")[0]!;
  return base !== articleNumber && struckLocators.has(base);
}
