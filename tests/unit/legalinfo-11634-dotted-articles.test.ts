import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { mongolianLawOutline } from "@/engine/knowledge/adapters/mongolia/law-outline";
import {
  CanonicalUnitRole,
  KnowledgeDocumentKind,
  LegalInfoKnowledgeParser,
  LegalInfoLawParser,
} from "@/engine/knowledge";
import { LegalNodeKind } from "@/engine/knowledge/schema";

const FIXTURE_11634 = readFileSync(
  join(process.cwd(), "tests/fixtures/legalinfo-11634-dotted-articles.html"),
  "utf8",
);
const FIXTURE_367 = readFileSync(
  join(process.cwd(), "tests/fixtures/legalinfo-367-constitution.html"),
  "utf8",
);

function articleNumbersFromHierarchy(
  nodes: ReturnType<LegalInfoLawParser["parse"]>["hierarchy"],
): string[] {
  const found: string[] = [];
  for (const node of nodes) {
    if (node.kind === LegalNodeKind.ARTICLE && node.locator?.article) {
      found.push(node.locator.article);
    }
    found.push(...articleNumbersFromHierarchy(node.children));
  }
  return found;
}

describe("LegalInfo 11634 dotted article headings", () => {
  it("parses observed 17.1 / 17.2 headings from nested law_content chrome", async () => {
    const document = new LegalInfoLawParser().parse(FIXTURE_11634);
    const numbers = articleNumbersFromHierarchy(document.hierarchy);
    expect(numbers).toContain("1.1");
    expect(numbers).toContain("17.1");
    expect(numbers).toContain("17.2");
    expect(numbers).not.toContain("17");

    const parsed = await new LegalInfoKnowledgeParser().parse({
      sourceId: "legalinfo",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=11634",
      kind: KnowledgeDocumentKind.HTML,
      bytes: new TextEncoder().encode(FIXTURE_11634),
      fetchedAt: new Date(),
    });

    expect(parsed.articles.length).toBeGreaterThanOrEqual(3);
    const article171 = parsed.articles.find(
      (article) => article.articleNumber === "17.1",
    );
    const article172 = parsed.articles.find(
      (article) => article.articleNumber === "17.2",
    );
    expect(article171?.text).toContain("17.1 дүгээр зүйл.Хулгайлах");
    expect(article171?.text).toContain(
      "Бусдын эд хөрөнгийг хүч хэрэглэхгүйгээр, нууцаар, хууль бусаар авсан бол",
    );
    expect(article172?.text).toContain("17.2 дугаар зүйл.Дээрэмдэх");
    expect(parsed.articles.some((article) => article.articleNumber === "17")).toBe(
      false,
    );
  });

  it("keeps integer 17, dotted 17.1 / 17.2, and paragraph 17.1. distinct", () => {
    const units = mongolianLawOutline([
      "17 дугаар зүйл.Ерөнхий",
      "17.1.Нэгж.",
      "17.1 дүгээр зүйл.Хулгайлах",
      "17.2 дүгээр зүйл.Дээрэмдэх",
    ]);
    const articles = units.filter((unit) => unit.role === CanonicalUnitRole.ARTICLE);
    expect(articles.map((unit) => unit.number)).toEqual(["17", "17.1", "17.2"]);
    const paragraphs = units.filter(
      (unit) => unit.role === CanonicalUnitRole.PARAGRAPH,
    );
    expect(paragraphs.map((unit) => `${unit.article}.${unit.paragraph}`)).toEqual(
      ["17.1"],
    );
  });

  it("does not treat 17.1. inside integer article 17 as an article heading", () => {
    const html = `<!DOCTYPE html>
<html>
<body>
  <div class="law_content">
    <div class="maincontenter">
      <p>17 дугаар зүйл.Гэмт хэргийн ангилал</p>
      <p>17.1.Хөнгөн.</p>
      <p>17.2.Хүндэвтэр.</p>
    </div>
  </div>
</body>
</html>`;
    const document = new LegalInfoLawParser().parse(html);
    const numbers = articleNumbersFromHierarchy(document.hierarchy);
    expect(numbers).toEqual(["17"]);
    expect(numbers).not.toContain("17.1");
    expect(numbers).not.toContain("17.2");
  });

  it("still parses Constitution 367 integer and ordinal articles", async () => {
    const document = new LegalInfoLawParser().parse(FIXTURE_367);
    const numbers = articleNumbersFromHierarchy(document.hierarchy);
    expect(numbers).toContain("1");
    expect(numbers).toContain("12");

    const parsed = await new LegalInfoKnowledgeParser().parse({
      sourceId: "legalinfo",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=367",
      kind: KnowledgeDocumentKind.HTML,
      bytes: new TextEncoder().encode(FIXTURE_367),
      fetchedAt: new Date(),
    });
    expect(parsed.articles.some((article) => article.articleNumber === "1")).toBe(
      true,
    );
    expect(parsed.articles.some((article) => article.articleNumber === "12")).toBe(
      true,
    );
  });
});
