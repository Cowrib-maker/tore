import { describe, expect, it } from "vitest";

import { collectStruckLocators, isArticleNumberStruck } from "@/engine/knowledge/parser/struck-content";

describe("collectStruckLocators / isArticleNumberStruck", () => {
  it("detects a struck article heading and marks its dotted paragraphs struck too", () => {
    // Real fragment (trimmed) from legalinfo.mn's Civil Code page (lawId=299),
    // article 162 — explicitly repealed 2015-07-02, found via real local
    // ingestion during this session's corpus-integrity check.
    const html = `
      <p><s>162 дугаар зүйл. Зөвшөөрөл авах</s></p>
      <p><s>162.1.Хууль буюу гэрээнд өөрөөр заагаагүй бол дараахь тохиолдолд</s></p>
      <p>163 дугаар зүйл. Хөдлөх эд хөрөнгө болон эрхийг худалдах</p>
    `;
    const struck = collectStruckLocators(html);
    expect(struck.has("162")).toBe(true);
    expect(isArticleNumberStruck("162", struck)).toBe(true);
    expect(isArticleNumberStruck("162.1", struck)).toBe(true);
    // a paragraph not itself re-wrapped in <s> is still struck via its parent article
    expect(isArticleNumberStruck("162.2", struck)).toBe(true);
    expect(isArticleNumberStruck("163", struck)).toBe(false);
  });

  it("returns an empty set for HTML with no struck-through markup", () => {
    const struck = collectStruckLocators("<p>161 дугаар зүйл. Барьцаагаар хангагдах шаардлагыг шилжүүлэх</p>");
    expect(struck.size).toBe(0);
    expect(isArticleNumberStruck("161", struck)).toBe(false);
  });

  it("does not treat an unrelated article as struck merely because a different one is", () => {
    const struck = collectStruckLocators("<s>40 дүгээр зүйл. Хүчингүй</s>");
    expect(isArticleNumberStruck("41", struck)).toBe(false);
    expect(isArticleNumberStruck("40.1", struck)).toBe(true);
  });
});
