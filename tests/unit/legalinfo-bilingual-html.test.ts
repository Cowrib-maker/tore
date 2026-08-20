import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  KnowledgeDocumentKind,
  LegalInfoKnowledgeParser,
  LegalInfoLawParser,
} from "@/engine/knowledge";
import { LegalNodeKind } from "@/engine/knowledge/schema";

const FIXTURE_PATH = join(
  process.cwd(),
  "tests/fixtures/legalinfo-439-bilingual.html",
);

describe("LegalInfo bilingual English+Mongolian HTML structure", () => {
  it("prefers Mongolian statute pane over longer English translation", async () => {
    const html = readFileSync(FIXTURE_PATH, "utf8");
    const document = new LegalInfoLawParser().parse(html, {
      officialUrl: "https://legalinfo.mn/mn/detail?lawId=439",
    });

    expect(document.identity.title).toMatch(/ОРОН\s+СУУЦНЫ\s+ТУХАЙ/i);

    const articles: { number?: string; text: string }[] = [];
    const walk = (nodes: typeof document.hierarchy) => {
      for (const node of nodes) {
        if (node.kind === LegalNodeKind.ARTICLE) {
          articles.push({
            number: node.locator?.article ?? undefined,
            text: node.text ?? "",
          });
        }
        walk(node.children);
      }
    };
    walk(document.hierarchy);

    expect(articles.length).toBeGreaterThan(0);
    expect(articles.some((a) => a.number === "1")).toBe(true);
    expect(articles.some((a) => /Хуулийн\s+зорилт/i.test(a.text))).toBe(true);
    // Must not treat English "Article 1" headings as the statute body.
    expect(articles.some((a) => /^Article\s+\d+/i.test(a.text))).toBe(false);

    const parsed = await new LegalInfoKnowledgeParser().parse({
      sourceId: "legalinfo",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=439",
      kind: KnowledgeDocumentKind.HTML,
      bytes: new TextEncoder().encode(html),
      contentType: "text/html",
      fetchedAt: new Date(),
    });

    expect(parsed.articles.length).toBeGreaterThan(0);
    expect(
      parsed.articles.some((a) => /орон\s+сууцны\s+харилцаа/i.test(a.text)),
    ).toBe(true);
    expect(parsed.articles.some((a) => /Purpose of this Law/i.test(a.text))).toBe(
      false,
    );
  });
});
