/**
 * Parses an already-fetched LegalInfo.mn detail page and extracts exactly
 * the requested article/paragraph — reusing the SAME parser production
 * batch ingestion uses (`LegalInfoKnowledgeParser`, itself built on
 * `LegalInfoLawParser`), not a bespoke re-implementation.
 *
 * `extractVerifiedLegalInfoArticle` is the safety boundary: it returns
 * `found` only when the document's own parsed title is canonically the
 * same document as the citation's title hint, an article node with the
 * exact requested number exists, AND that provision is not marked
 * repealed on the page. Anything else — wrong law, article not found,
 * repealed — is a genuine miss, never a best-effort guess.
 *
 * Repeal detection (post-audit fix): legalinfo.mn marks a repealed
 * article or paragraph by wrapping its heading/text in `<s>...</s>`
 * directly in the page HTML — confirmed live on a real, currently-in-
 * force law (a later amendment repealed one of its articles, and the
 * struck-through original text is still shown inline for reference).
 * `LegalInfoKnowledgeParser`'s plain-text extraction strips ALL tags,
 * `<s>` included, so the shared parser alone cannot see this — this
 * module additionally scans the raw HTML (before that stripping) for a
 * struck-through span whose content starts with the matched article or
 * paragraph number, and refuses rather than returning that text as
 * current law.
 */
import {
  KnowledgeDocumentKind,
  type KnowledgeArticle,
  type RawKnowledgeDocument,
} from "@/engine/knowledge/types";
import { LegalInfoKnowledgeParser } from "@/engine/knowledge/parser/legalinfo-knowledge.parser";
import { canonicalLawTitlesMatch } from "./legalinfo-title-discovery";

export type VerifiedLegalInfoArticle = {
  documentTitle: string;
  articleNumber: string;
  paragraphNumber: string | null;
  text: string;
  validFrom: string | null;
  validTo: string | null;
};

export type ExtractLegalInfoArticleResult =
  | { kind: "found"; article: VerifiedLegalInfoArticle }
  | { kind: "not_found" }
  /** The matched provision exists but is struck through (repealed/superseded) on the page itself. */
  | { kind: "repealed"; articleNumber: string };

function wantedArticleNumbers(article: string, paragraph: string | null): string[] {
  if (!paragraph) {
    return [article];
  }
  const dotted = `${article}.${paragraph}`;
  return [dotted, article];
}

/**
 * @param html Raw HTML bytes already fetched from an allowlisted official URL.
 * @param sourceUrl The exact URL the HTML was fetched from — never invented.
 * @param titleHint The law title as named in the citation (e.g. from `detectExactCitation`).
 * @param article Requested article number, e.g. "56".
 * @param paragraph Requested paragraph number, e.g. "1", or null for the whole article.
 */
export async function extractVerifiedLegalInfoArticle(input: {
  html: string;
  sourceUrl: string;
  titleHint: string;
  article: string;
  paragraph: string | null;
}): Promise<ExtractLegalInfoArticleResult> {
  const raw: RawKnowledgeDocument = {
    sourceId: "legalinfo-live",
    sourceUrl: input.sourceUrl,
    kind: KnowledgeDocumentKind.HTML,
    bytes: new TextEncoder().encode(input.html),
    contentType: "text/html",
    fetchedAt: new Date(),
  };

  let parsed;
  try {
    parsed = await new LegalInfoKnowledgeParser().parse(raw);
  } catch {
    return { kind: "not_found" };
  }

  const title = parsed.title?.trim();
  if (!title || !canonicalLawTitlesMatch(title, input.titleHint)) {
    // Wrong document (or unparsable title) — never bind a citation to a
    // law we can't confirm is the one actually named.
    return { kind: "not_found" };
  }

  const wanted = wantedArticleNumbers(input.article, input.paragraph);
  const article = findArticle(parsed.articles, wanted);
  if (!article) {
    return { kind: "not_found" };
  }
  const matchedNumber = article.articleNumber ?? input.article;

  const struckLocators = collectStruckLocators(input.html);
  if (isArticleNumberStruck(matchedNumber, struckLocators)) {
    return { kind: "repealed", articleNumber: matchedNumber };
  }

  return {
    kind: "found",
    article: {
      documentTitle: title,
      articleNumber: matchedNumber,
      paragraphNumber: input.paragraph,
      text: article.text,
      validFrom: parsed.validFrom ?? null,
      validTo: parsed.validTo ?? null,
    },
  };
}

function findArticle(
  articles: readonly KnowledgeArticle[],
  wantedNumbers: readonly string[],
): KnowledgeArticle | null {
  for (const number of wantedNumbers) {
    const hit = articles.find((a) => (a.articleNumber ?? "").trim() === number);
    if (hit) {
      return hit;
    }
  }
  return null;
}

const STRUCK_HEADING_PATTERN =
  /<(?:s|strike)[^>]*>\s*(\d+(?:\.\d+)?)\s*(?:дугаар|дүгээр)\s*зүйл/giu;
const STRUCK_PARAGRAPH_PATTERN = /<(?:s|strike)[^>]*>\s*(\d+(?:\.\d+)+)\s*\./g;

/**
 * Extracts every article/paragraph locator that appears inside a
 * struck-through span in the raw page HTML — legalinfo.mn's own convention
 * for showing a repealed provision inline. Regex over raw HTML, not the
 * parsed tree, because the shared parser deliberately strips all markup
 * (including these tags) before this module ever sees text.
 *
 * Tag coverage (evidence from the real local corpus, 2026-09-22): both the
 * modern `<s>` and the legacy `<strike>` tag are used for the same purpose
 * across real documents (22 real documents use `<strike>` only, wrapping
 * whole sub-paragraphs like "21.1.2...."). `<del>` was also seen but only
 * once, wrapping a single character — not evidence of a real convention, so
 * it is deliberately not treated as a struck-through signal. Locators can
 * be deeper than two levels ("21.1.2", not just "40.1"), so the paragraph
 * pattern captures the full dotted locator and isArticleNumberStruck checks
 * every ancestor prefix.
 *
 * Exported so cache-verified-web-document.ts can apply the exact same
 * detection at the cache boundary — the shared LegalInfoKnowledgeParser
 * (batch ingestion's parser, reused for validation before a cache write)
 * has already lost these markers by the time it produces
 * `KnowledgeArticle[]`, so caching must scan the same raw HTML
 * independently rather than trust the parser's output.
 */
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
 * containing paragraph, or the top-level article heading) is struck, even
 * on the rare page where a child isn't individually re-wrapped in its own
 * strikethrough tag.
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
