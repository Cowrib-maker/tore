import { describe, expect, it } from "vitest";

import { mongolianLawOutline } from "@/engine/knowledge/adapters/mongolia/law-outline";
import {
  CanonicalUnitRole,
  createKnowledgeEngine,
  extractArticleNumberFromText,
  InMemoryKnowledgeCrawler,
  InMemoryKnowledgeRepository,
  KnowledgeDocumentKind,
  LegalInfoKnowledgeParser,
  LegalInfoLawParser,
  normalizeArticleNumber,
} from "@/engine/knowledge";
import { LegalNodeKind } from "@/engine/knowledge/schema";

const INTEGER_AND_PARAGRAPH_HTML = `<!DOCTYPE html>
<html>
<body>
  <div class="law-content">
    <p>ТУРШИЛТЫН ХУУЛЬ ТУХАЙ</p>
    <p>17 дугаар зүйл.Ерөнхий</p>
    <p>17.1.Нэгдүгээр нэгж.</p>
    <p>17.2.Хоёрдугаар нэгж.</p>
    <p>18 дугаар зүйл.Дараагийн</p>
    <p>18.1.Текст.</p>
  </div>
</body>
</html>`;

const DOTTED_ARTICLE_HEADING_HTML = `<!DOCTYPE html>
<html>
<body>
  <div class="law-content">
    <p>ТУРШИЛТЫН ХУУЛЬ ТУХАЙ</p>
    <p>17.1 дүгээр зүйл.Тусгай нэгж</p>
    <p>17.1.1.Дэд нэгж.</p>
  </div>
</body>
</html>`;

describe("dotted article / paragraph identity", () => {
  it("classifies 17.1 дүгээр зүйл as article 17.1, not 17", () => {
    const units = mongolianLawOutline([
      "17 дүгээр зүйл.Ерөнхий",
      "17.1 дүгээр зүйл.Тусгай",
      "17.1.Нэгж.",
      "17.2.Нэгж.",
    ]);
    const articles = units.filter((unit) => unit.role === CanonicalUnitRole.ARTICLE);
    expect(articles.map((unit) => unit.number)).toEqual(["17", "17.1"]);
    const paragraphs = units.filter(
      (unit) => unit.role === CanonicalUnitRole.PARAGRAPH,
    );
    expect(paragraphs.map((unit) => `${unit.article}.${unit.paragraph}`)).toEqual(
      ["17.1", "17.2"],
    );
  });

  it("keeps integer article parsing", () => {
    const document = new LegalInfoLawParser().parse(INTEGER_AND_PARAGRAPH_HTML);
    const articles: string[] = [];
    const walk = (nodes: typeof document.hierarchy) => {
      for (const node of nodes) {
        if (node.kind === LegalNodeKind.ARTICLE && node.locator?.article) {
          articles.push(node.locator.article);
        }
        walk(node.children);
      }
    };
    walk(document.hierarchy);
    expect(articles).toContain("17");
    expect(articles).toContain("18");
    expect(articles).not.toContain("17.1");
  });

  it("stores 17, 17.1, and 17.2 as distinct searchable article numbers", async () => {
    const parsed = await new LegalInfoKnowledgeParser().parse({
      sourceId: "legalinfo",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=local-dotted",
      kind: KnowledgeDocumentKind.HTML,
      bytes: new TextEncoder().encode(INTEGER_AND_PARAGRAPH_HTML),
      fetchedAt: new Date(),
    });
    const numbers = parsed.articles.map((article) => article.articleNumber);
    expect(numbers).toContain("17");
    expect(numbers).toContain("17.1");
    expect(numbers).toContain("17.2");
    expect(numbers.filter((value) => value === "17")).toHaveLength(1);

    const paragraph17_1 = parsed.articles.find(
      (article) => article.articleNumber === "17.1",
    );
    expect(paragraph17_1?.text).toMatch(/Нэгдүгээр нэгж/);
    expect(paragraph17_1?.text).not.toMatch(/Хоёрдугаар нэгж/);
  });

  it("preserves a dotted article heading as 17.1 without fabricating further numbers", async () => {
    const document = new LegalInfoLawParser().parse(DOTTED_ARTICLE_HEADING_HTML);
    const walkArticles = (nodes: typeof document.hierarchy): string[] => {
      const found: string[] = [];
      for (const node of nodes) {
        if (node.kind === LegalNodeKind.ARTICLE && node.locator?.article) {
          found.push(node.locator.article);
        }
        found.push(...walkArticles(node.children));
      }
      return found;
    };
    expect(walkArticles(document.hierarchy)).toContain("17.1");
    expect(walkArticles(document.hierarchy)).not.toContain("17");

    const parsed = await new LegalInfoKnowledgeParser().parse({
      sourceId: "legalinfo",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=local-dotted-heading",
      kind: KnowledgeDocumentKind.HTML,
      bytes: new TextEncoder().encode(DOTTED_ARTICLE_HEADING_HTML),
      fetchedAt: new Date(),
    });
    expect(
      parsed.articles.some((article) => article.articleNumber === "17.1"),
    ).toBe(true);
    expect(
      parsed.articles.some((article) => article.articleNumber === "17"),
    ).toBe(false);
    expect(
      parsed.articles.some((article) => article.articleNumber === "17.1.1"),
    ).toBe(false);
  });

  it("lets repository search distinguish 17 from 17.1 and 17.2 without embeddings", async () => {
    const repository = new InMemoryKnowledgeRepository();
    const engine = createKnowledgeEngine({
      crawler: new InMemoryKnowledgeCrawler([
        {
          sourceId: "legalinfo",
          sourceUrl: "https://legalinfo.mn/mn/detail?lawId=local-search",
          kind: KnowledgeDocumentKind.HTML,
          bytes: new TextEncoder().encode(INTEGER_AND_PARAGRAPH_HTML),
          fetchedAt: new Date(),
        },
      ]),
      parser: new LegalInfoKnowledgeParser(),
      repository,
    });
    const ingested = await engine.ingest({ sourceId: "legalinfo" });
    expect(ingested.failed).toEqual([]);

    const hit17 = await repository.searchArticles({ articleNumber: "17" });
    const hit171 = await repository.searchArticles({ articleNumber: "17.1" });
    const hit172 = await repository.searchArticles({ articleNumber: "17.2" });

    expect(hit17[0]?.articleNumber).toBe("17");
    expect(hit171[0]?.articleNumber).toBe("17.1");
    expect(hit172[0]?.articleNumber).toBe("17.2");
    expect(hit171[0]?.articleNumber).not.toBe(hit17[0]?.articleNumber);
  });

  it("normalizes dotted article tokens without collapsing to the parent integer", () => {
    expect(normalizeArticleNumber("17.1")).toBe("17.1");
    expect(normalizeArticleNumber("зүйл 17.1")).toBe("17.1");
    expect(normalizeArticleNumber("17")).toBe("17");
    expect(extractArticleNumberFromText("17.1 дүгээр зүйл")).toBe("17.1");
    expect(extractArticleNumberFromText("Зүйл 18")).toBe("18");
  });
});
