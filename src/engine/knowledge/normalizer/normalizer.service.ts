import type {
  IKnowledgeNormalizer,
  KnowledgeArticle,
  NormalizedKnowledgeDocument,
  ParsedKnowledgeDocument,
} from "../types";

/**
 * Unicode and whitespace normalizer.
 *
 * Preserves legal wording. Does not translate, summarize, or call a model.
 */
export class UnicodeKnowledgeNormalizer implements IKnowledgeNormalizer {
  /**
   * NFC-normalizes titles and article text and collapses internal whitespace.
   */
  normalize(document: ParsedKnowledgeDocument): NormalizedKnowledgeDocument {
    const articles: KnowledgeArticle[] = document.articles.map((article) => ({
      ...article,
      title: normalizeText(article.title),
      text: normalizeText(article.text) ?? "",
    }));
    const title = normalizeText(document.title) ?? document.sourceUrl;

    return {
      ...document,
      title,
      normalizedTitle: title,
      articles,
    };
  }
}

function normalizeText(value: string | null): string | null {
  if (value == null) {
    return null;
  }
  const normalized = value.normalize("NFC").replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}
