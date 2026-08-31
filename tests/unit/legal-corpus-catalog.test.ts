import { describe, expect, it } from "vitest";

import {
  InMemoryKnowledgeRepository,
  KnowledgeDocumentKind,
  LEGALINFO_ACT_TYPE_CATEGORIES,
  LEGALINFO_ACT_TYPE_CATEGORY_IDS,
  documentTypeForLegalInfoCategory,
  isCitableOfficialDocumentType,
  isPositiveLawDocumentType,
  sourceTypeForLegalInfoCategory,
} from "@/engine/knowledge";

describe("LegalInfo act-type catalog", () => {
  it("covers every official act family from legalinfo.mn/mn/law", () => {
    expect(LEGALINFO_ACT_TYPE_CATEGORY_IDS).toEqual([
      "26",
      "27",
      "28",
      "29",
      "30",
      "31",
      "32",
      "16231124857801",
      "33",
      "34",
      "35",
      "36",
      "37",
      "38",
      "180",
      "186",
      "390",
    ]);
    expect(LEGALINFO_ACT_TYPE_CATEGORIES).toHaveLength(17);
    expect(sourceTypeForLegalInfoCategory("27")).toBe("law");
    expect(sourceTypeForLegalInfoCategory("33")).toBe("government_resolution");
    expect(documentTypeForLegalInfoCategory("34")).toBe("MINISTERIAL_ORDER");
    expect(sourceTypeForLegalInfoCategory("99")).toBe("other");
  });

  it("does not use subject-matter filters as ingest categories", () => {
    expect(LEGALINFO_ACT_TYPE_CATEGORY_IDS).not.toContain("1");
    expect(LEGALINFO_ACT_TYPE_CATEGORY_IDS).not.toContain("21");
  });
});

describe("official source retrieval kinds", () => {
  it("treats regulations and court acts as citable, commentary as not", () => {
    expect(isCitableOfficialDocumentType("GOVERNMENT_RESOLUTION")).toBe(true);
    expect(isCitableOfficialDocumentType("MINISTERIAL_ORDER")).toBe(true);
    expect(isCitableOfficialDocumentType("COURT_JUDGMENT")).toBe(true);
    expect(isCitableOfficialDocumentType("SUPREME_COURT_RESOLUTION")).toBe(true);
    expect(isCitableOfficialDocumentType("LEGAL_COMMENTARY")).toBe(false);
    expect(isPositiveLawDocumentType("GOVERNMENT_RESOLUTION")).toBe(false);
    expect(isPositiveLawDocumentType("LAW")).toBe(true);
  });

  it("returns a government resolution when officialSourceKinds is all", async () => {
    const knowledge = new InMemoryKnowledgeRepository();
    await knowledge.save({
      id: "doc-resolution",
      sourceId: "legalinfo",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=res-1",
      title: "Засгийн газрын 268 дугаар тогтоол",
      kind: KnowledgeDocumentKind.HTML,
      metadata: {
        title: "Засгийн газрын 268 дугаар тогтоол",
        language: "mn",
        jurisdiction: "MN",
        documentType: "GOVERNMENT_RESOLUTION",
        sourceUrl: "https://legalinfo.mn/mn/detail?lawId=res-1",
        articleCount: 1,
      },
      articles: [
        {
          id: "art-1",
          articleNumber: "1",
          title: "1 дүгээр зүйл",
          text: "Хайгуулын сонгон шалгаруулалтын журам.",
          order: 0,
        },
      ],
      chunks: [],
      ingestedAt: new Date("2026-01-01T00:00:00.000Z"),
      provenance: {
        archiveId: "arch-res-1",
        sha256: "sha256-res-1",
        originalUrl: "https://legalinfo.mn/mn/detail?lawId=res-1",
        lawId: "res-1",
      },
    });

    const statuteOnly = await knowledge.searchArticles({
      text: "сонгон шалгаруулалт",
      jurisdiction: "MN",
      limit: 5,
    });
    expect(statuteOnly).toHaveLength(0);

    const allOfficial = await knowledge.searchArticles({
      text: "сонгон шалгаруулалт",
      jurisdiction: "MN",
      officialSourceKinds: "all",
      limit: 5,
    });
    expect(allOfficial).toHaveLength(1);
    expect(allOfficial[0]?.documentType).toBe("GOVERNMENT_RESOLUTION");
  });
});
