import { describe, expect, it } from "vitest";

import {
  classifyCriminalCodeTitle,
  identifyCriminalCodeFromDocuments,
} from "@/engine/knowledge";

describe("identifyCriminalCodeFromDocuments", () => {
  it("reports the observed Criminal Code lawId from discovery titles", () => {
    const result = identifyCriminalCodeFromDocuments([
      {
        lawId: "367",
        officialUrl: "https://legalinfo.mn/mn/detail?lawId=367",
        title: "МОНГОЛ УЛСЫН ҮНДСЭН ХУУЛЬ",
      },
      {
        lawId: "59",
        officialUrl: "https://legalinfo.mn/mn/detail?lawId=59",
        title: "Эрүүгийн байцаан шийтгэх хууль",
      },
      {
        lawId: "observed-from-discovery",
        officialUrl: "https://legalinfo.mn/mn/detail?lawId=observed-from-discovery",
        title: "Эрүүгийн хууль",
      },
      {
        lawId: "amendment-row",
        officialUrl: "https://legalinfo.mn/mn/detail?lawId=amendment-row",
        title: "Эрүүгийн хуульд нэмэлт, өөрчлөлт оруулах тухай",
      },
    ]);

    expect(result.matches).toEqual([
      {
        lawId: "observed-from-discovery",
        officialUrl: "https://legalinfo.mn/mn/detail?lawId=observed-from-discovery",
        title: "Эрүүгийн хууль",
        titleClass: "match",
      },
    ]);
    expect(result.skippedRelated.map((row) => row.titleClass).sort()).toEqual([
      "amendment",
      "procedure",
    ]);
  });

  it("does not invent a lawId when discovery has no Criminal Code title", () => {
    const result = identifyCriminalCodeFromDocuments([
      {
        lawId: "439",
        officialUrl: "https://legalinfo.mn/mn/detail?lawId=439",
        title: "Орон сууцны тухай",
      },
    ]);
    expect(result.matches).toEqual([]);
  });

  it("classifies procedure and amendment titles without treating them as the Code", () => {
    expect(classifyCriminalCodeTitle("Эрүүгийн байцаан шийтгэх хууль")).toBe(
      "procedure",
    );
    expect(
      classifyCriminalCodeTitle("Эрүүгийн хуульд нэмэлт өөрчлөлт оруулах тухай"),
    ).toBe("amendment");
    expect(classifyCriminalCodeTitle("Эрүүгийн хууль")).toBe("match");
    expect(classifyCriminalCodeTitle(null)).toBe("unrelated");
  });
});
