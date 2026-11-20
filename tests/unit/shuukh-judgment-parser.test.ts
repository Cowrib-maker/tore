import { describe, expect, it } from "vitest";

import {
  caseIdFromShuukhUrl,
  parseShuukhCaseAjaxPayload,
  parseShuukhJudgmentHtml,
  parseShuukhListHtml,
  shuukhJudgmentUrl,
} from "@/engine/knowledge";
import { ShuukhJudgmentParser } from "@/engine/knowledge/parsers/court";
import { KnowledgeDocumentKind } from "@/engine/knowledge/types";

const LIST_HTML = `
<table>
<tbody>
<tr>
  <td><a class="act-name" href="/single_case/260600?id=1&court_cat=1&bb=1" target="_blank">Дундговь аймаг дахь сум дундын анхан шатны шүүх /Иргэний хэрэг/</a></td>
  <td><a href="/single_case/260600?id=1&court_cat=1&bb=1">2026-07-30</a></td>
</tr>
<tr>
  <td><a class="act-name" href="/single_case/260599?id=1&court_cat=1&bb=1">Улаанбаатар хотын иргэний хэргийн анхан шатны шүүх</a></td>
</tr>
</tbody>
</table>
`;

const JUDGMENT_HTML = `
<html>
  <body>
    <h6>Шийдвэрийн мэдээлэл</h6>
    <p>Дундговь аймаг дахь сум дундын анхан шатны шүүх /Иргэний хэрэг/ийн Шийдвэр</p>
    <p>2026 оны 07 сарын 30 өдөр</p>
    <p>Дугаар 310/ШШ2026/00576</p>
    <p>Гэр бүлийн тухай хуулийн 14 дүгээр зүйлийн 14.1-т зааснаар гэрлэлтийг цуцалсугай.</p>
    <p>Иргэний хуулийн 130 дугаар зүйлийн 130.2-т зааснаар тэтгэлэг тогтоосугай.</p>
  </body>
</html>
`;

// Structurally matches the actual shuukh.mn "Шийдвэрийн мэдээлэл" panel
// (confirmed against a live detail page) — a <th>Label</th><td>Value</td>
// table, not the plain <p> tags JUDGMENT_HTML (above) assumes.
const JUDGMENT_HTML_TABLE_LAYOUT = `
<html>
  <body>
    <div class="col-md-4 full-search">
      <h6>Шийдвэрийн мэдээлэл</h6>
      <table class="table table-bordered">
        <tbody>
          <tr><th>Шүүх</th><td>Дархан-Уул аймгийн Иргэний хэргийн давж заалдах шатны шүүх </td></tr>
          <tr><th>Шүүгч</th><td>Мянган Оюунцэцэг </td></tr>
          <tr><th>Хэргийн индекс</th><td>307/2025/00401/и </td></tr>
          <tr><th>Дугаар</th><td>209/МА2026/00036 </td></tr>
          <tr><th>Огноо</th><td>2026-07-06 </td></tr>
        </tbody>
      </table>
    </div>
    <h6>Холбоотой шийдвэрүүд</h6>
    <table class="table table-bordered">
      <tbody>
        <tr><th>Шүүх</th><td>Энэ бол өөр, холбоотой шийдвэрийн мэдээлэл — үл тооцно</td></tr>
        <tr><th>Дугаар</th><td>999/ХХ2026/99999</td></tr>
      </tbody>
    </table>
    <p>Дархан-Уул аймгийн Иргэний хэргийн давж заалдах шатны шүүхийн Магадлал</p>
    <p>Гэр бүлийн тухай хуулийн 14 дүгээр зүйлийн 14.1-т зааснаар гэрлэлтийг цуцалсугай.</p>
  </body>
</html>
`;

describe("shuukh.mn list and judgment parsers", () => {
  it("extracts official single_case ids without inventing numbers", () => {
    const items = parseShuukhListHtml(LIST_HTML);
    expect(items).toHaveLength(2);
    expect(items[0]?.caseId).toBe("260600");
    expect(items[0]?.officialUrl).toContain("single_case/260600");
    expect(items[0]?.officialUrl).toContain("court_cat=1");
    expect(items[0]?.courtName).toBe(
      "Дундговь аймаг дахь сум дундын анхан шатны шүүх /Иргэний хэрэг/",
    );
    expect(caseIdFromShuukhUrl(items[1]!.officialUrl)).toBe("260599");
  });

  it("parses case_ajax JSON view fragments", () => {
    const payload = JSON.stringify({
      pagination_link: "<ul></ul>",
      count: "2",
      view: LIST_HTML,
    });
    const items = parseShuukhCaseAjaxPayload(payload);
    expect(items).toHaveLength(2);
    expect(items[0]?.caseId).toBe("260600");
  });

  it("keeps printed case number and holding text", async () => {
    const parsed = parseShuukhJudgmentHtml(
      JUDGMENT_HTML,
      "https://shuukh.mn/single_case/260600",
    );
    expect(parsed.caseNumber).toBe("310/ШШ2026/00576");
    expect(parsed.text).toContain("Гэр бүлийн тухай хуулийн 14 дүгээр зүйл");
    expect(parsed.text).toContain("Иргэний хуулийн 130 дугаар зүйл");

    const parser = new ShuukhJudgmentParser();
    const document = await parser.parse({
      sourceId: "shuukh",
      sourceUrl: "https://shuukh.mn/single_case/260600",
      kind: KnowledgeDocumentKind.HTML,
      bytes: new TextEncoder().encode(JUDGMENT_HTML),
      fetchedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(document.articles).toHaveLength(1);
    expect(document.articles[0]?.articleNumber).toBe("310/ШШ2026/00576");
    expect(document.validFrom).toBe("2026-07-30");
  });

  it("extracts court name, case number, and date from the real table-based info panel", async () => {
    const parsed = parseShuukhJudgmentHtml(
      JUDGMENT_HTML_TABLE_LAYOUT,
      "https://shuukh.mn/single_case/37257?id=2&court_cat=1&bb=1",
    );
    expect(parsed.courtName).toBe(
      "Дархан-Уул аймгийн Иргэний хэргийн давж заалдах шатны шүүх",
    );
    expect(parsed.caseNumber).toBe("209/МА2026/00036");
    expect(parsed.decidedOn).toBe("2026-07-06");
    expect(parsed.title).toBe(
      "Дархан-Уул аймгийн Иргэний хэргийн давж заалдах шатны шүүх — 209/МА2026/00036",
    );

    const parser = new ShuukhJudgmentParser();
    const document = await parser.parse({
      sourceId: "shuukh",
      sourceUrl: "https://shuukh.mn/single_case/37257?id=2&court_cat=1&bb=1",
      kind: KnowledgeDocumentKind.HTML,
      bytes: new TextEncoder().encode(JUDGMENT_HTML_TABLE_LAYOUT),
      fetchedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(document.validFrom).toBe("2026-07-06");
  });
});
