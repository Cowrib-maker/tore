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
    };
  }
}

function articlesFromHierarchy(nodes: LegalNode[]): KnowledgeArticle[] {
  const articles: KnowledgeArticle[] = [];

  const walk = (list: LegalNode[]) => {
    for (const node of list) {
      if (node.kind === LegalNodeKind.ARTICLE) {
        const lines = [
          node.text,
          ...descendantTexts(node.children),
        ].filter((line): line is string => Boolean(line?.trim()));
        articles.push({
          articleNumber: node.locator?.article ?? null,
          title: node.heading,
          text: lines.join("\n"),
          order: articles.length,
        });
        continue;
      }
      walk(node.children);
    }
  };

  walk(nodes);
  return articles;
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
