import { describe, expect, it } from "vitest";

import {
  extractLegalInfoAdoptionDate,
  extractLegalInfoMetadata,
  resolveLegalInfoEffectiveDate,
} from "@/engine/knowledge/adapters/mongolia/legalinfo/html";

/** Minimal fragment mirroring the real "sanal-form" filter widget every archived page has. */
function sanalForm(type: string, date: string, place: string, title: string): string {
  return `
    <form class="sanal-form" action="#">
      <div><input type="radio" data-status="checked"><label>${type}</label></div>
      <div><input type="radio" data-status="checked"><label>${date}</label></div>
      <div><input type="radio" data-status="checked"><label>${place}</label></div>
      <div><input type="radio" data-status="checked"><label>${title}</label></div>
    </form>
  `;
}

describe("extractLegalInfoAdoptionDate — real corpus evidence", () => {
  it("extracts the second checked label as this document's own adoption date (real: lawId=299, Civil Code)", () => {
    const html = `<html><body>${sanalForm(
      "МОНГОЛ УЛСЫН ХУУЛЬ",
      "2002 ОНЫ 1 ДҮГЭЭР САРЫН 10-НЫ ӨДӨР",
      "УЛААНБААТАР ХОТ",
      "ИРГЭНИЙ ХУУЛЬ",
    )}</body></html>`;
    expect(extractLegalInfoAdoptionDate(html)).toBe("2002-01-10");
  });

  it("handles the alternate 'X САРЫН Y ӨДӨР' form without the дугаар/дүгээр ordinal word (real: lawId=9408)", () => {
    const html = `<html><body>${sanalForm(
      "МОНГОЛ УЛСЫН ХУУЛЬ",
      "2011 ОНЫ 10 САРЫН 06 ӨДӨР",
      "УЛААНБААТАР ХОТ",
      "КОМПАНИЙН ТУХАЙ ХУУЛИЙГ ХҮЧИНГҮЙ БОЛСОНД ТООЦОХ ТУХАЙ",
    )}</body></html>`;
    expect(extractLegalInfoAdoptionDate(html)).toBe("2011-10-06");
  });

  it("returns null when the page has no sanal-form filter widget at all", () => {
    expect(extractLegalInfoAdoptionDate("<html><body>no filter widget here</body></html>")).toBeNull();
  });
});

describe("resolveLegalInfoEffectiveDate — real corpus evidence", () => {
  it("FIXED_DATE: resolves the explicit date directly, ignoring the (irrelevant) adoption date", () => {
    const html = `<html><body>
      <div class="law-content">
        <p>1 дүгээр зүйл. Хуулийн зорилт нь энэ хуулиар зохицуулна.</p>
        <p>2 дугаар зүйл. Энэ хуулийг 2004 оны 1 дүгээр сарын 1-ний өдрөөс эхлэн дагаж мөрдөнө. МОНГОЛ УЛСЫН ИХ ХУРЛЫН ДАРГА Д.ДЭМБЭРЭЛ</p>
      </div>
    </body></html>`;
    expect(resolveLegalInfoEffectiveDate(html, "1999-01-01")).toBe("2004-01-01");
  });

  it("SELF_ADOPTION_DATE: resolves to the caller-supplied adoption date, never a different one", () => {
    const html = `<html><body>
      <div class="law-content">
        <p>1 дүгээр зүйл. Хуулийн зорилт нь энэ хуулиар зохицуулна.</p>
        <p>2 дугаар зүйл. Энэ хууль батлагдсан өдрөөс хүчин төгөлдөр болно. МОНГОЛ УЛСЫН ИХ ХУРЛЫН ДАРГА Н.ЭНХБАЯР</p>
      </div>
    </body></html>`;
    expect(resolveLegalInfoEffectiveDate(html, "2005-03-01")).toBe("2005-03-01");
  });

  it("SELF_ADOPTION_DATE with no known adoption date stays null — never guesses", () => {
    const html = `<html><body>
      <div class="law-content">
        <p>2 дугаар зүйл. Энэ хууль батлагдсан өдрөөс хүчин төгөлдөр болно.</p>
      </div>
    </body></html>`;
    expect(resolveLegalInfoEffectiveDate(html, null)).toBeNull();
  });

  it("CROSS_DOCUMENT_REFERENCE: stays null — never resolves a second document's own date", () => {
    const html = `<html><body>
      <div class="law-content">
        <p>1 дүгээр зүйл.2001 оны 4 дүгээр сарын 19-ний өдөр баталсан Хөдөлмөр эрхлэлтийг дэмжих тухай хуулийг хүчингүй болсонд тооцсугай.</p>
        <p>2 дугаар зүйл.Энэ хуулийг Хөдөлмөр эрхлэлтийг дэмжих тухай /Шинэчилсэн найруулга/ хууль хүчин төгөлдөр болсон өдрөөс эхлэн дагаж мөрдөнө. МОНГОЛ УЛСЫН ИХ ХУРЛЫН ДАРГА Д.ДЭМБЭРЭЛ</p>
      </div>
    </body></html>`;
    expect(resolveLegalInfoEffectiveDate(html, "2011-10-13")).toBeNull();
  });

  it("returns null when the law body has no entry-into-force clause at all", () => {
    const html = `<html><body>
      <div class="law-content">
        <p>1 дүгээр зүйл. Хуулийн зорилт нь энэ хуулиар зохицуулна.</p>
      </div>
    </body></html>`;
    expect(resolveLegalInfoEffectiveDate(html, "2005-03-01")).toBeNull();
  });
});

describe("extractLegalInfoMetadata — wires the new extractors into issuedOn/effectiveOn", () => {
  it("populates issuedOn (adoption date) and effectiveOn (FIXED_DATE) from real-shaped HTML", () => {
    const html = `<html><head><meta property="og:title" content="ТЕСТ ХУУЛЬ"></head><body>
      ${sanalForm("МОНГОЛ УЛСЫН ХУУЛЬ", "2004 ОНЫ 1 ДҮГЭЭР САРЫН 1-НИЙ ӨДӨР", "УЛААНБААТАР ХОТ", "ТЕСТ ХУУЛЬ")}
      <div class="law-content">
        <p>1 дүгээр зүйл. Хуулийн зорилт нь энэ хуулиар зохицуулна.</p>
        <p>2 дугаар зүйл. Энэ хуулийг 2004 оны 1 дүгээр сарын 1-ний өдрөөс эхлэн дагаж мөрдөнө. МОНГОЛ УЛСЫН ИХ ХУРЛЫН ДАРГА</p>
      </div>
    </body></html>`;
    const meta = extractLegalInfoMetadata(html);
    expect(meta.issuedOn).toBe("2004-01-01");
    expect(meta.effectiveOn).toBe("2004-01-01");
  });

  it("leaves effectiveOn null (never invented) when the entry-into-force clause is a cross-document reference", () => {
    const html = `<html><head><meta property="og:title" content="ТЕСТ ХУУЛЬ 2"></meta></head><body>
      ${sanalForm("МОНГОЛ УЛСЫН ХУУЛЬ", "2011 ОНЫ 10 ДУГААР САРЫН 13-НЫ ӨДӨР", "УЛААНБААТАР ХОТ", "ТЕСТ ХУУЛЬ 2")}
      <div class="law-content">
        <p>1 дүгээр зүйл. Тест зорилт.</p>
        <p>2 дугаар зүйл. Энэ хуулийг Өөр хууль хүчин төгөлдөр болсон өдрөөс эхлэн дагаж мөрдөнө.</p>
      </div>
    </body></html>`;
    const meta = extractLegalInfoMetadata(html);
    expect(meta.issuedOn).toBe("2011-10-13");
    expect(meta.effectiveOn).toBeNull();
  });
});
