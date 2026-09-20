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
  if (struckLocators.has(matchedNumber) || struckLocators.has(input.article)) {
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

const STRUCK_HEADING_PATTERN = /<s[^>]*>\s*(\d+(?:\.\d+)?)\s*(?:дугаар|дүгээр)\s*зүйл/giu;
const STRUCK_PARAGRAPH_PATTERN = /<s[^>]*>\s*(\d+\.\d+)\s*\./g;

/**
 * Extracts every article/paragraph locator that appears inside a
 * `<s>...</s>` (struck-through) span in the raw page HTML — legalinfo.mn's
 * own convention for showing a repealed provision inline. Regex over raw
 * HTML, not the parsed tree, because the shared parser deliberately
 * strips all markup (including `<s>`) before this module ever sees text.
 */
function collectStruckLocators(html: string): Set<string> {
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
