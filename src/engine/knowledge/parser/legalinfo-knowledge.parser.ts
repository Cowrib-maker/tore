import { LegalInfoLawParser } from "../adapters/mongolia/legalinfo";
import { LegalNodeKind, type LegalNode } from "../schema";
import type {
  IKnowledgeParser,
  KnowledgeArticle,
  ParsedKnowledgeDocument,
  RawKnowledgeDocument,
} from "../types";

/**
 * Bridges {@link LegalInfoLawParser} (adapter + law parser) into the
 * knowledge ingestion port {@link IKnowledgeParser}.
 *
 * Does not fetch or persist. Input is already-fetched HTML bytes.
 */
export class LegalInfoKnowledgeParser implements IKnowledgeParser {
  constructor(
    private readonly lawParser: LegalInfoLawParser = new LegalInfoLawParser(),
  ) {}

  async parse(raw: RawKnowledgeDocument): Promise<ParsedKnowledgeDocument> {
    const html = new TextDecoder("utf-8").decode(raw.bytes);
    const document = this.lawParser.parse(html, {
      officialUrl: raw.sourceUrl,
    });

    return {
      sourceId: raw.sourceId,
      sourceUrl: raw.sourceUrl,
      title: document.identity.title,
      kind: raw.kind,
      articles: articlesFromHierarchy(document.hierarchy),
      validFrom:
        document.temporal.validFrom ?? document.temporal.effectiveOn ?? null,
      validTo: document.temporal.validTo ?? null,
      // LegalInfo HTML has no authoritative statute version label.
      sourceVersion: null,
    };
  }
}

/**
 * Flatten the legal tree into searchable knowledge rows.
 *
 * Integer articles stay as `"17"`. Dotted article headings (`17.1 дүгээр зүйл`)
 * and printed paragraphs (`17.1.`) are stored as `"17.1"` so retrieval can
 * distinguish 17 / 17.1 / 17.2 without embeddings. Parent article `"17"` is
 * kept when the source printed it. Subparagraphs are not extra rows.
 */
function articlesFromHierarchy(nodes: LegalNode[]): KnowledgeArticle[] {
  const articles: KnowledgeArticle[] = [];
  const seen = new Set<string>();

  const pushArticle = (article: Omit<KnowledgeArticle, "order">) => {
    const key = article.articleNumber
      ? `n:${article.articleNumber}`
      : `t:${article.text}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    articles.push({ ...article, order: articles.length });
  };

  const walk = (list: LegalNode[]) => {
    for (const node of list) {
      if (node.kind === LegalNodeKind.ARTICLE) {
        const lines = [
          node.text,
          ...descendantTexts(node.children),
        ].filter((line): line is string => Boolean(line?.trim()));
        pushArticle({
          articleNumber: node.locator?.article ?? null,
          title: node.heading,
          text: lines.join("\n"),
        });
        for (const child of node.children) {
          if (child.kind !== LegalNodeKind.PARAGRAPH) {
            continue;
          }
          const paragraphNumber = paragraphSearchNumber(child);
          if (!paragraphNumber) {
            continue;
          }
          const paragraphLines = [
            child.text,
            ...descendantTexts(child.children),
          ].filter((line): line is string => Boolean(line?.trim()));
          pushArticle({
            articleNumber: paragraphNumber,
            title: child.locator?.display ?? null,
            text: paragraphLines.join("\n"),
          });
        }
        continue;
      }
      walk(node.children);
    }
  };

  walk(nodes);
  return articles;
}

/**
 * Searchable paragraph identity from the printed locator only.
 * Does not invent numbering when the source omitted a dotted display.
 */
function paragraphSearchNumber(node: LegalNode): string | null {
  const display = node.locator?.display?.trim() ?? "";
  if (/^\d+(?:\.\d+)+$/.test(display)) {
    return display;
  }
  const article = node.locator?.article?.trim() ?? "";
  const paragraph = node.locator?.paragraph?.trim() ?? "";
  if (article && paragraph && !article.includes(".")) {
    return `${article}.${paragraph}`;
  }
  return null;
}

function descendantTexts(nodes: LegalNode[]): string[] {
  const texts: string[] = [];
  for (const node of nodes) {
    if (node.text?.trim()) {
      texts.push(node.text.trim());
    }
    texts.push(...descendantTexts(node.children));
  }
  return texts;
}
