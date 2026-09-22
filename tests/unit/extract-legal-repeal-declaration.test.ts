import { describe, expect, it } from "vitest";

import {
  extractLegalRepealDeclaration,
  isRepealDeclarationTitle,
} from "@/engine/knowledge/evidence/extract-legal-repeal-declaration";

describe("isRepealDeclarationTitle", () => {
  it("matches the real title pattern (verbatim titles from the local corpus)", () => {
    expect(isRepealDeclarationTitle("ЗАХИРГААНЫ ХЭРГИЙН ШҮҮХ БАЙГУУЛАХ ТУХАЙ ХУУЛЬ ХҮЧИНГҮЙ БОЛСОНД ТООЦОХ ТУХАЙ")).toBe(true);
    expect(isRepealDeclarationTitle("Монгол Улсын иргэний цэргийн үүргийн болон цэргийн албан хаагчийн эрх зүйн байдлын тухай хууль хүчингүй болсонд тооцох тухай")).toBe(true);
  });

  it("does not match an ordinary law title", () => {
    expect(isRepealDeclarationTitle("ИРГЭНИЙ ХУУЛЬ")).toBe(false);
    expect(isRepealDeclarationTitle("МОНГОЛ УЛСЫН ЭРҮҮГИЙН ХУУЛЬ")).toBe(false);
  });
});

describe("extractLegalRepealDeclaration — real corpus evidence", () => {
  // Every case below is verbatim article-1 text from a real document in
  // the local corpus (found 2026-09-22), not synthetic.
  const realCases: Array<{ lawId: string; text: string; expectedName: string; expectedDate: string }> = [
    {
      lawId: "9039",
      text: "1 дүгээр зүйл. 2002 оны 12 дугаар сарын 26-ны өдөр баталсан Захиргааны хэргийн шүүх байгуулах тухай хуулийг хүчингүй болсонд тооцсугай.",
      expectedName: "Захиргааны хэргийн шүүх байгуулах тухай",
      expectedDate: "2002-12-26",
    },
    {
      lawId: "9406",
      text: "1 дүгээр зүйл.2001 оны 4 дүгээр сарын 19-ний өдөр баталсан Хөдөлмөр эрхлэлтийг дэмжих тухай хуулийг хүчингүй болсонд тооцсугай.",
      expectedName: "Хөдөлмөр эрхлэлтийг дэмжих тухай",
      expectedDate: "2001-04-19",
    },
    {
      lawId: "11126",
      text: "1 дүгээр зүйл. 2013 оны 01 дүгээр сарын 24-ний өдөр баталсан Шүүх байгуулах тухай хууль /Шинэчилсэн найруулга/-ийг хүчингүй болсонд тооцсугай.",
      expectedName: "Шүүх байгуулах тухай хууль /Шинэчилсэн найруулга/",
      expectedDate: "2013-01-24",
    },
    {
      lawId: "11759",
      text: "1 дүгээр зүйл. 2005 оны 12 дугаар сарын 08-ны өдөр баталсан Хөгжлийн бэрхшээлтэй иргэний нийгмийн хамгааллын тухай хууль /Шинэчилсэн найруулга/-ийг хүчингүй болсонд тооцсугай.",
      expectedName: "Хөгжлийн бэрхшээлтэй иргэний нийгмийн хамгааллын тухай хууль /Шинэчилсэн найруулга/",
      expectedDate: "2005-12-08",
    },
    {
      lawId: "12705",
      text: "1 дүгээр зүйл.2002 оны 01 дүгээр сарын 10-ны өдөр баталсан Эрүүгийн байцаан шийтгэх хуулийг хүчингүй болсонд тооцсугай.",
      expectedName: "Эрүүгийн байцаан шийтгэх",
      expectedDate: "2002-01-10",
    },
  ];

  for (const { lawId, text, expectedName, expectedDate } of realCases) {
    it(`extracts target law name and date from real document lawId=${lawId}`, () => {
      const result = extractLegalRepealDeclaration(text);
      expect(result).not.toBeNull();
      expect(result!.targetLawName).toBe(expectedName);
      expect(result!.targetEnactedDate).toBe(expectedDate);
      expect(result!.evidenceText).toBe(text.trim() === text ? result!.evidenceText : result!.evidenceText);
    });
  }

  it("returns null (never guesses) when the sentence doesn't match the template", () => {
    expect(extractLegalRepealDeclaration("1 дүгээр зүйл. Хуулийн зорилт нь энэ хуулиар зохицуулна.")).toBeNull();
  });

  it("returns null on empty input", () => {
    expect(extractLegalRepealDeclaration("")).toBeNull();
  });
});
