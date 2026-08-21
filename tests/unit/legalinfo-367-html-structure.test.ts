import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createKnowledgeEngine,
  InMemoryKnowledgeCrawler,
  LegalInfoKnowledgeParser,
  LegalInfoLawParser,
  KnowledgeDocumentKind,
} from "@/engine/knowledge";
import { LegalNodeKind } from "@/engine/knowledge/schema";

const FIXTURE_PATH = join(
  process.cwd(),
  "tests/fixtures/legalinfo-367-constitution.html",
);

describe("LegalInfo lawId=367 real HTML structure regression", () => {
  const fixtureHtml = readFileSync(FIXTURE_PATH, "utf8");

  it("extracts constitution articles despite nested law_content toolbar divs", async () => {
    const lawParser = new LegalInfoLawParser();
    const document = lawParser.parse(fixtureHtml, {
      officialUrl: "https://legalinfo.mn/mn/detail?lawId=367",
    });

    expect(document.identity.title).toMatch(/ҮНДСЭН\s+ХУУЛЬ/i);

    const articles: { number: string | undefined; text: string }[] = [];
    const walk = (nodes: typeof document.hierarchy) => {
      for (const node of nodes) {
        if (node.kind === LegalNodeKind.ARTICLE) {
          articles.push({
            number: node.locator?.article,
            text: [node.text, ...flattenTexts(node.children)]
              .filter(Boolean)
              .join("\n"),
          });
        }
        walk(node.children);
      }
    };
    walk(document.hierarchy);

    expect(articles.length).toBeGreaterThan(0);
    expect(articles.some((a) => a.number === "1")).toBe(true);
    expect(articles.some((a) => a.number === "12")).toBe(true);

    const article1 = articles.find((a) => a.number === "1");
    expect(article1?.text).toMatch(/тусгаар\s+тогтносон/i);
    expect(article1?.text).toMatch(/бүрэн\s+эрхт/i);

    const knowledgeParser = new LegalInfoKnowledgeParser(lawParser);
    const parsed = await knowledgeParser.parse({
      sourceId: "legalinfo",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=367",
      kind: KnowledgeDocumentKind.HTML,
      bytes: new TextEncoder().encode(fixtureHtml),
      contentType: "text/html; charset=utf-8",
      fetchedAt: new Date(),
    });

    expect(parsed.articles.length).toBeGreaterThan(0);
    expect(
      parsed.articles.some(
        (a) =>
          a.articleNumber === "1" &&
          /тусгаар\s+тогтносон/i.test(a.text) &&
          /бүрэн\s+эрхт/i.test(a.text),
      ),
    ).toBe(true);

    const engine = createKnowledgeEngine({
      crawler: new InMemoryKnowledgeCrawler([
        {
          sourceId: "legalinfo",
          sourceUrl: "https://legalinfo.mn/mn/detail?lawId=367",
          kind: KnowledgeDocumentKind.HTML,
          bytes: new TextEncoder().encode(fixtureHtml),
          contentType: "text/html; charset=utf-8",
          fetchedAt: new Date(),
        },
      ]),
      parser: knowledgeParser,
    });

    const result = await engine.ingest({
      sourceId: "legalinfo",
      maxDocuments: 1,
    });
    expect(result.failed).toEqual([]);
    expect(result.ingested).toHaveLength(1);
    const stored = result.ingested[0]!;
    expect(stored.articles.length).toBeGreaterThan(0);
    expect(stored.chunks.length).toBeGreaterThan(0);
    expect(
      stored.articles.some((a) => /тусгаар\s+тогтносон/i.test(a.text)),
    ).toBe(true);
  });

  it("fails safely on empty or malformed HTML (no throw, zero articles)", async () => {
    const parser = new LegalInfoKnowledgeParser();

    for (const html of ["", "<html></html>", "<div><div>broken"]) {
      const parsed = await parser.parse({
        sourceId: "legalinfo",
        sourceUrl: "https://legalinfo.mn/mn/detail?lawId=367",
        kind: KnowledgeDocumentKind.HTML,
        bytes: new TextEncoder().encode(html),
        contentType: "text/html",
        fetchedAt: new Date(),
      });
      expect(parsed.articles).toEqual([]);
    }
  });
});

function flattenTexts(
  nodes: { text: string | null; children: unknown[] }[],
): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.text?.trim()) {
      out.push(node.text.trim());
    }
    out.push(
      ...flattenTexts(
        node.children as { text: string | null; children: unknown[] }[],
      ),
    );
  }
  return out;
}
