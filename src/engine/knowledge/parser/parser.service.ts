import {
  KnowledgeDocumentKind,
  type IKnowledgeParser,
  type KnowledgeArticle,
  type ParsedKnowledgeDocument,
  type RawKnowledgeDocument,
} from "../types";

/**
 * Structural parser for HTML/text sources.
 *
 * Splits on blank lines / heading-like lines. It does not interpret
 * Mongolian legal article numbering — inject a LegalInfo parser later
 * through {@link IKnowledgeParser}.
 */
export class StructuralKnowledgeParser implements IKnowledgeParser {
  async parse(raw: RawKnowledgeDocument): Promise<ParsedKnowledgeDocument> {
    if (raw.kind === KnowledgeDocumentKind.PDF) {
      return {
        sourceId: raw.sourceId,
        sourceUrl: raw.sourceUrl,
        title: titleFromUrl(raw.sourceUrl),
        kind: raw.kind,
        articles: [],
      };
    }

    const decoded = new TextDecoder("utf-8").decode(raw.bytes);
    const text =
      raw.kind === KnowledgeDocumentKind.HTML ? stripMarkup(decoded) : decoded;
    const articles = splitArticles(text);
    const title =
      articles[0]?.title?.trim() ||
      firstLine(text) ||
      titleFromUrl(raw.sourceUrl);

    return {
      sourceId: raw.sourceId,
      sourceUrl: raw.sourceUrl,
      title,
      kind: raw.kind,
      articles,
    };
  }
}

function stripMarkup(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|li|tr)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function splitArticles(text: string): KnowledgeArticle[] {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    return [];
  }

  return blocks.map((block, order) => {
    const heading = block.match(/^(зүйл|article)\s+([\d.]+)\s*[-.:]?\s*(.*)$/i);
    if (heading) {
      return {
        articleNumber: heading[2] ?? null,
        title: heading[3]?.trim() || null,
        text: block,
        order,
      };
    }
    return {
      articleNumber: null,
      title: block.length > 80 ? null : block,
      text: block,
      order,
    };
  });
}

function firstLine(text: string): string {
  return text.split(/\n/)[0]?.replace(/\s+/g, " ").trim() ?? "";
}

function titleFromUrl(sourceUrl: string): string {
  try {
    const path = new URL(sourceUrl).pathname;
    const leaf = path.split("/").filter(Boolean).at(-1);
    return leaf ? decodeURIComponent(leaf) : sourceUrl;
  } catch {
    return sourceUrl;
  }
}
