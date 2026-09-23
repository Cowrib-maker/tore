import { describe, expect, it } from "vitest";

import { classifyEntryIntoForceClause } from "@/engine/knowledge/temporal/classify-entry-into-force-clause";

describe("classifyEntryIntoForceClause — real corpus evidence", () => {
  // Every case below is a verbatim final-article snippet found in the real
  // local corpus (2026-09-23), not synthetic.

  describe("FIXED_DATE", () => {
    const realCases: Array<{ lawId: string; text: string; expectedDate: string }> = [
      {
        lawId: "81",
        text: "2 дугаар зүйл.Энэ хуулийг 2011 оны 11 дүгээр сарын 30-ны өдрөөс эхлэн дагаж мөрдөнө. МОНГОЛ УЛСЫН ИХ ХУРЛЫН ДАРГА Д.ДЭМБЭРЭЛ",
        expectedDate: "2011-11-30",
      },
      {
        lawId: "196",
        text: "2 дугаар зүйл. Энэ хуулийг 2004 оны 1 дүгээр сарын 1-ний өдрөөс эхлэн дагаж мөрдөнө МОНГОЛ УЛСЫН ИХ ХУРЛЫН ДЭД ДАРГА Ж.БЯМБАДОРЖ",
        expectedDate: "2004-01-01",
      },
      {
        lawId: "197",
        text: "2 дугаар зүйл. Энэ хууль 2005 оны 3 дугаар сарын 1-ний өдрөөс хүчин төгөлдөр болно. МОНГОЛ УЛСЫН ИХ ХУРЛЫН ДАРГА Н.ЭНХБАЯР",
        expectedDate: "2005-03-01",
      },
      {
        lawId: "270",
        text: "2 дугаар зүйл. Энэ хууль 2001 оны 12 дугаар сарын 1-ний өдрөөс эхлэн хүчин төгөлдөр болно. МОНГОЛ УЛСЫН ИХ ХУРЛЫН ДАРГА С.ТӨМӨР-ОЧИР",
        expectedDate: "2001-12-01",
      },
      {
        lawId: "14776",
        text: "5 дугаар зүйл.Энэ хуулийг 2019 оны 11 дүгээр сарын 26-ны өдрөөс эхлэн дагаж мөрдөнө. МОНГОЛ УЛСЫН ИХ ХУРЛЫН ДАРГА Г.ЗАНДАНШАТАР",
        expectedDate: "2019-11-26",
      },
    ];

    for (const { lawId, text, expectedDate } of realCases) {
      it(`extracts the fixed effective date from real document lawId=${lawId}`, () => {
        const result = classifyEntryIntoForceClause(text);
        expect(result.kind).toBe("FIXED_DATE");
        expect(result).toMatchObject({ date: expectedDate });
      });
    }
  });

  describe("SELF_ADOPTION_DATE", () => {
    it("real document lawId=194 — bare 'батлагдсан өдрөөс', own adoption date must be supplied by the caller", () => {
      const result = classifyEntryIntoForceClause(
        "2 дугаар зүйл. Энэ хууль батлагдсан өдрөөс хүчин төгөлдөр болно. МОНГОЛ УЛСЫН ИХ ХУРЛЫН ДАРГА Н.ЭНХБАЯР",
      );
      expect(result.kind).toBe("SELF_ADOPTION_DATE");
    });

    it("real document lawId=336 — 'энэ хууль батлагдсан өдрөөс эхлэн'", () => {
      const result = classifyEntryIntoForceClause(
        "2.Энэ хууль батлагдсан өдрөөс эхлэн хүчин төгөлдөр болно. МОНГОЛ УЛСЫН ИХ ХУРЛЫН ДАРГА Н.БАГАБАНДИ",
      );
      expect(result.kind).toBe("SELF_ADOPTION_DATE");
    });
  });

  describe("CROSS_DOCUMENT_REFERENCE — never resolves the second document's date itself", () => {
    it("real document lawId=12705 — defers to another named law's own effective date, with an edition bracket", () => {
      const result = classifyEntryIntoForceClause(
        "2 дугаар зүйл.Энэ хуулийг Эрүүгийн хэрэг хянан шийдвэрлэх тухай хууль /Шинэчилсэн найруулга/ хүчин төгөлдөр болсон өдрөөс эхлэн дагаж мөрдөнө. МОНГОЛ УЛСЫН ИХ ХУРЛЫН ДЭД ДАРГА Ц.НЯМДОРЖ",
      );
      expect(result.kind).toBe("CROSS_DOCUMENT_REFERENCE");
      if (result.kind === "CROSS_DOCUMENT_REFERENCE") {
        expect(result.referencedLawText).toContain("Эрүүгийн хэрэг хянан шийдвэрлэх тухай хууль");
      }
    });

    it("real document lawId=9495 — defers to a differently-named successor law (not a same-title revision)", () => {
      const result = classifyEntryIntoForceClause(
        "2 дугаар зүйл.Энэ хуулийг Хөрөнгө оруулалтын тухай хууль хүчин төгөлдөр болсон өдрөөс эхлэн дагаж мөрдөнө. МОНГОЛ УЛСЫН ИХ ХУРЛЫН ДАРГА З.ЭНХБОЛД",
      );
      expect(result.kind).toBe("CROSS_DOCUMENT_REFERENCE");
    });

    it("real document lawId=16207199230601 — no 'эхлэн', still recognized", () => {
      const result = classifyEntryIntoForceClause(
        "2 дугаар зүйл.Энэ хуулийг Монгол Улсын шүүхийн тухай хууль /Шинэчилсэн найруулга/ хүчин төгөлдөр болсон өдрөөс дагаж мөрдөнө. МОНГОЛ УЛСЫН ИХ ХУРЛЫН ДАРГА Г.ЗАНДАНШАТАР",
      );
      expect(result.kind).toBe("CROSS_DOCUMENT_REFERENCE");
    });

    it("does not misread the referenced law's own embedded adoption date as this clause's fixed effective date (real document lawId=11126)", () => {
      const result = classifyEntryIntoForceClause(
        "2 дугаар зүйл. Энэ хуулийг 2015 оны 06 дугаар сарын 19-ний өдөр баталсан Шүүх байгуулах тухай хууль /Шинэчилсэн найруулга/ хүчин төгөлдөр болсон өдрөөс эхлэн дагаж мөрдөнө. МОНГОЛ УЛСЫН ИХ ХУРЛЫН ДАРГА З.ЭНХБОЛД",
      );
      // Must NOT be FIXED_DATE with the 2015-06-19 date — that date describes
      // when the REFERENCED law was adopted, not this clause's own effect.
      expect(result.kind).toBe("CROSS_DOCUMENT_REFERENCE");
      expect(result.kind).not.toBe("FIXED_DATE");
    });
  });

  describe("UNRECOGNIZED — never guesses", () => {
    it("real Constitution clause (lawId=367) using a traditional lunar-calendar date, not a plain Gregorian one", () => {
      const result = classifyEntryIntoForceClause(
        "2.Монгол Улсын Үндсэн хуулийг 1992 оны хоёрдугаар сарын 12-ны өдрийн 12 цаг буюу арван долдугаар жарны усан бичин жилийн хаврын тэргүүн хар барс сарын шинийн есний идрийн барилдлагаатай өлзийт сайн шар морин өдрийн морин",
      );
      expect(result.kind).toBe("UNRECOGNIZED");
    });

    it("real clause (lawId=338) with a Cyrillic-letter typo in the year ('199З' instead of '1993')", () => {
      const result = classifyEntryIntoForceClause(
        "19 дүгээр зүйл.Хууль хүчин төгөлдөр болох Энэ хуулийг 199З оны 6 дугаар сарын 10-ны өдрөөс эхлэн дагаж мөрдөнө. МОНГОЛ УЛСЫН ИХ ХУРЛЫН ДАРГА Н.БАГАБАНДИ",
      );
      expect(result.kind).toBe("UNRECOGNIZED");
    });

    it("empty input", () => {
      expect(classifyEntryIntoForceClause("")).toEqual({ kind: "UNRECOGNIZED", evidenceText: null });
    });

    it("text with no entry-into-force vocabulary at all", () => {
      const result = classifyEntryIntoForceClause("1 дүгээр зүйл. Хуулийн зорилт нь энэ хуулиар зохицуулна.");
      expect(result.kind).toBe("UNRECOGNIZED");
      expect(result.evidenceText).not.toBeNull();
    });
  });

  it("is deterministic and idempotent — same input always produces the same result", () => {
    const text =
      "2 дугаар зүйл.Энэ хуулийг 2009 оны 10 дугаар сарын 30-ны өдрөөс эхлэн дагаж мөрдөнө. МОНГОЛ УЛСЫН ИХ ХУРЛЫН ДАРГА Д.ДЭМБЭРЭЛ";
    expect(classifyEntryIntoForceClause(text)).toEqual(classifyEntryIntoForceClause(text));
  });
});
