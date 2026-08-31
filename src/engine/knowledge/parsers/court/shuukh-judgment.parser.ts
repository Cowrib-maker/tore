import type {
  IKnowledgeParser,
  KnowledgeArticle,
  ParsedKnowledgeDocument,
  RawKnowledgeDocument,
} from "../../types";
import { parseShuukhJudgmentHtml } from "../../crawler/shuukh-url";

/**
 * Converts a shuukh.mn judgment HTML snapshot into searchable knowledge
 * articles. One judgment is one document; numbered holdings stay as printed.
 */
export class ShuukhJudgmentParser implements IKnowledgeParser {
  async parse(raw: RawKnowledgeDocument): Promise<ParsedKnowledgeDocument> {
    const html = new TextDecoder("utf-8").decode(raw.bytes);
    const judgment = parseShuukhJudgmentHtml(html, raw.sourceUrl);
    const text = judgment.text.trim();
    if (!text) {
      throw new Error("shuukh judgment has no printable holding text");
    }

    const articles: KnowledgeArticle[] = [
      {
        articleNumber: judgment.caseNumber,
        title: judgment.title,
        text,
        order: 0,
      },
    ];

    return {
      sourceId: raw.sourceId,
      sourceUrl: raw.sourceUrl,
      title: judgment.title,
      kind: raw.kind,
      articles,
      validFrom: isoFromMongolianDate(judgment.decidedOn),
      validTo: null,
      sourceVersion: judgment.caseNumber,
    };
  }
}

function isoFromMongolianDate(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/(\d{4})\s*оны\s*(\d{1,2})\s*сарын\s*(\d{1,2})/);
  if (!match) return null;
  const year = match[1];
  const month = match[2]!.padStart(2, "0");
  const day = match[3]!.padStart(2, "0");
  return `${year}-${month}-${day}`;
}
