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

  it("detects the legacy <strike> tag, not just <s> (real corpus: 22 documents use <strike> only)", () => {
    // Real fragment shape from the local corpus (lawId=563/564-style labor
    // law pages): whole sub-paragraphs wrapped in <strike>, not <s>.
    const html = `<p><strike>21.1.2.хөдөлмөрийн аюулгүй байдал, эрүүл ахуйн үндэсний хөтөлбөрийг боловсруулж, хэрэгжүүлэх</strike></p>`;
    const struck = collectStruckLocators(html);
    expect(isArticleNumberStruck("21.1.2", struck)).toBe(true);
    expect(isArticleNumberStruck("21.1.3", struck)).toBe(false);
  });

  it("captures a three-level dotted locator in full, not truncated to two levels", () => {
    const struck = collectStruckLocators(`<strike>22.1.8.ажил олгогчоос төлөх</strike>`);
    expect(struck.has("22.1.8")).toBe(true);
    // the deep locator must be checkable directly, not just via its top-level article
    expect(isArticleNumberStruck("22.1.8", struck)).toBe(true);
  });

  it("treats a struck parent paragraph as covering its own unlisted children, at any depth", () => {
    const struck = collectStruckLocators(`<s>12.2.Хамтарсан багийн үйл ажиллагаа</s>`);
    expect(isArticleNumberStruck("12.2", struck)).toBe(true);
    expect(isArticleNumberStruck("12.2.4", struck)).toBe(true);
    expect(isArticleNumberStruck("12.3", struck)).toBe(false);
  });

  it("does not treat a lone <del> character as a struck-through repeal signal (real corpus: 1 file, 1-char match, not a real convention)", () => {
    const struck = collectStruckLocators(`<p><del>З</del> 40 дугаар зүйл. Хэвээр хүчинтэй</p>`);
    expect(isArticleNumberStruck("40", struck)).toBe(false);
  });
});
