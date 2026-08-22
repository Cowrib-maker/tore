import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractLegalInfoCrossReferences,
  type LegalInfoCrossReference,
} from "@/engine/knowledge";

/**
 * SYNTHETIC HTML for the extractor only.
 * Not a LegalInfo live capture. Local production fixtures (367 / 439 / 11634)
 * do not contain cross-instrument detail links.
 */
function syntheticPage(input: {
  sourceLawId: string;
  title: string;
  body: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <link rel="canonical" href="https://legalinfo.mn/mn/detail?lawId=${input.sourceLawId}" />
  <script>var lawId = "${input.sourceLawId}";</script>
  <title>${input.title}</title>
</head>
<body>
  <h1>${input.title}</h1>
  <div data-block="enacteddate">2017 оны 5 дугаар сарын 25</div>
  <div data-block="enforcementdate">2017 оны 7 дугаар сарын 01</div>
  <div class="law-content">
    ${input.body}
  </div>
</body>
</html>`;
}

function extract(
  sourceLawId: string,
  html: string,
): LegalInfoCrossReference[] {
  return extractLegalInfoCrossReferences({
    sourceLawId,
    sourceUrl: `https://legalinfo.mn/mn/detail?lawId=${sourceLawId}`,
    rawHtml: html,
  });
}

describe("extractLegalInfoCrossReferences", () => {
  it("A. extracts an explicit absolute detail URL", () => {
    const html = syntheticPage({
      sourceLawId: "299",
      title: "Иргэний хууль",
      body: `<p>1 дүгээр зүйл.</p>
        <p>Харьцуул: <a href="https://legalinfo.mn/mn/detail?lawId=310">Компанийн тухай хууль</a></p>`,
    });
    const rows = extract("299", html);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      relationType: "CITES",
      sourceLawId: "299",
      targetLawId: "310",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=299",
      targetUrl: "https://legalinfo.mn/mn/detail?lawId=310",
      evidenceKind: "EXPLICIT_LEGALINFO_LAW_LINK",
    });
    expect(rows[0]?.evidenceText).toContain("Компанийн тухай хууль");
    expect(rows[0]?.evidenceText).toContain("lawId=310");
  });

  it("B. extracts an explicit relative detail URL", () => {
    const html = syntheticPage({
      sourceLawId: "299",
      title: "Иргэний хууль",
      body: `<p><a href="/mn/detail?lawId=565">Хөдөлмөрийн тухай хууль</a></p>`,
    });
    const rows = extract("299", html);
    expect(rows).toEqual([
      expect.objectContaining({
        targetLawId: "565",
        targetUrl: "https://legalinfo.mn/mn/detail?lawId=565",
        relationType: "CITES",
      }),
    ]);
  });

  it("C. extracts multiple target lawIds", () => {
    const html = syntheticPage({
      sourceLawId: "299",
      title: "Иргэний хууль",
      body: `<p><a href="/mn/detail?lawId=310">Компани</a></p>
        <p><a href="https://legalinfo.mn/mn/detail?lawId=565">Хөдөлмөр</a></p>`,
    });
    expect(extract("299", html).map((row) => row.targetLawId)).toEqual([
      "310",
      "565",
    ]);
  });

  it("D. deduplicates the same target and keeps unique evidence contexts", () => {
    const html = syntheticPage({
      sourceLawId: "299",
      title: "Иргэний хууль",
      body: `<p>Эхний ишлэл <a href="/mn/detail?lawId=310">Компанийн тухай хууль</a></p>
        <p>Дахин ишлэл <a href="https://legalinfo.mn/mn/detail?lawId=310">Компанийн тухай хууль</a></p>`,
    });
    const rows = extract("299", html);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.targetLawId).toBe("310");
    expect(rows[0]?.evidenceText.split("\n").length).toBeGreaterThanOrEqual(1);
  });

  it("E. ignores unrelated numeric query parameters", () => {
    const html = syntheticPage({
      sourceLawId: "299",
      title: "Иргэний хууль",
      body: `<a href="/mn/ajaxList/?page=12">жагсаалт</a>
        <img src="/api/captcha?x=1787404746728368" />
        <a href="/mn/detail?category=27">ангилал</a>`,
    });
    expect(extract("299", html)).toEqual([]);
  });

  it("F. ignores article numbers that are not detail URLs", () => {
    const html = syntheticPage({
      sourceLawId: "299",
      title: "Иргэний хууль",
      body: `<p>17.1 дүгээр зүйл. Хулгайлах</p><p>17.2 дугаар зүйл.</p>`,
    });
    expect(extract("299", html)).toEqual([]);
  });

  it("G. ignores dates", () => {
    const html = syntheticPage({
      sourceLawId: "299",
      title: "Иргэний хууль",
      body: `<p>2021 оны 5 сарын 10-нд</p><p>2021-05-10</p>`,
    });
    expect(extract("299", html)).toEqual([]);
  });

  it("H. ignores title similarity without a detail URL", () => {
    const html = syntheticPage({
      sourceLawId: "299",
      title: "Иргэний хууль",
      body: `<p>Энэ хууль Компанийн тухай хууль болон Хөдөлмөрийн тухай хуультай холбоотой.</p>`,
    });
    expect(extract("299", html)).toEqual([]);
  });

  it("I. /Шинэчилсэн найруулга/ produces no relation by itself", () => {
    const html = readFileSync(
      join(process.cwd(), "tests/fixtures/legalinfo-11634-dotted-articles.html"),
      "utf8",
    );
    expect(
      extractLegalInfoCrossReferences({
        sourceLawId: "11634",
        sourceUrl: "https://legalinfo.mn/mn/detail?lawId=11634",
        rawHtml: html,
      }),
    ).toEqual([]);
  });

  it("J. a repeal-style title produces no relation by itself", () => {
    const html = syntheticPage({
      sourceLawId: "12705",
      title: "ЭРҮҮГИЙН БАЙЦААН ШИЙТГЭХ ХУУЛЬ ХҮЧИНГҮЙ БОЛСОНД ТООЦОХ ТУХАЙ",
      body: `<p>ЭРҮҮГИЙН БАЙЦААН ШИЙТГЭХ ХУУЛЬ ХҮЧИНГҮЙ БОЛСОНД ТООЦОХ ТУХАЙ</p>`,
    });
    expect(extract("12705", html)).toEqual([]);
  });

  it("K. source lawId comes only from verified self metadata", () => {
    const html = syntheticPage({
      sourceLawId: "999",
      title: "Эрүүгийн хууль",
      body: `<p><a href="/mn/detail?lawId=310">Компанийн тухай хууль</a></p>`,
    });
    const rows = extract("299", html);
    expect(rows[0]?.sourceLawId).toBe("299");
    expect(rows[0]?.sourceLawId).not.toBe("999");
  });

  it("L. target lawId comes only from an explicit detail URL", () => {
    const html = syntheticPage({
      sourceLawId: "299",
      title: "Иргэний хууль",
      body: `<p>lawId 473 татварын ерөнхий хууль</p>
        <p><a href="/mn/detail?lawId=310">холбоос</a></p>`,
    });
    expect(extract("299", html).map((row) => row.targetLawId)).toEqual(["310"]);
  });

  it("M–Q. output is always CITES and never a legal-effect relation or date", () => {
    const html = syntheticPage({
      sourceLawId: "299",
      title: "Иргэний хууль",
      body: `<a href="/mn/detail?lawId=310">Компани</a>`,
    });
    const serialized = JSON.stringify(extract("299", html));
    expect(serialized).toContain('"relationType":"CITES"');
    expect(serialized).not.toContain("AMENDS");
    expect(serialized).not.toContain("REPEALS");
    expect(serialized).not.toContain("SUPERSEDES");
    expect(serialized).not.toContain("IN_FORCE");
    expect(serialized).not.toContain("REPEALED");
    expect(serialized).not.toContain("effectiveDate");
    expect(serialized).not.toContain("HISTORICALLY_IN_FORCE");
  });

  it("R. generic Civil fixture cites only via an explicit URL", () => {
    const html = syntheticPage({
      sourceLawId: "299",
      title: "Иргэний хууль",
      body: `<p>Иргэний хууль</p><p><a href="/mn/detail?lawId=302">Иргэний хэрэг шүүхэд хянан шийдвэрлэх тухай</a></p>`,
    });
    expect(extract("299", html)[0]?.targetLawId).toBe("302");
  });

  it("S. generic Company fixture", () => {
    const html = syntheticPage({
      sourceLawId: "310",
      title: "Компанийн тухай хууль",
      body: `<a href="https://legalinfo.mn/mn/detail?lawId=299">Иргэний хууль</a>`,
    });
    expect(extract("310", html)[0]).toMatchObject({
      sourceLawId: "310",
      targetLawId: "299",
      relationType: "CITES",
    });
  });

  it("T. generic Labor fixture", () => {
    const html = syntheticPage({
      sourceLawId: "565",
      title: "Хөдөлмөрийн тухай хууль",
      body: `<a href="/mn/detail?lawId=299">Иргэний хууль</a>`,
    });
    expect(extract("565", html)[0]?.targetLawId).toBe("299");
  });

  it("does not treat the page canonical URL as a cross-reference", () => {
    const html = readFileSync(
      join(process.cwd(), "tests/fixtures/legalinfo-367-constitution.html"),
      "utf8",
    );
    expect(
      extractLegalInfoCrossReferences({
        sourceLawId: "367",
        sourceUrl: "https://legalinfo.mn/mn/detail?lawId=367",
        rawHtml: html,
      }),
    ).toEqual([]);
  });

  it("does not treat the bilingual housing fixture as a cross-reference", () => {
    const html = readFileSync(
      join(process.cwd(), "tests/fixtures/legalinfo-439-bilingual.html"),
      "utf8",
    );
    expect(
      extractLegalInfoCrossReferences({
        sourceLawId: "439",
        sourceUrl: "https://legalinfo.mn/mn/detail?lawId=439",
        rawHtml: html,
      }),
    ).toEqual([]);
  });

  it("does not emit a self-CITES when the body repeats the source detail URL", () => {
    const html = syntheticPage({
      sourceLawId: "299",
      title: "Иргэний хууль",
      body: `<a href="https://legalinfo.mn/mn/detail?lawId=299">энэ хууль</a>
        <a href="/mn/detail?lawId=310">компани</a>`,
    });
    expect(extract("299", html).map((row) => row.targetLawId)).toEqual(["310"]);
  });
});
