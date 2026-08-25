import { describe, expect, it } from "vitest";

import {
  LegalIntelligenceCategory,
  LegalIntelligenceStatus,
  buildLegalIntelligenceFeed,
  classifyLegalIntelligence,
  emptyLegalIntelligenceFeed,
  toLegalIntelligenceRecord,
  type LegalIntelligenceSourceRow,
} from "@/domain/legal-intelligence";

function row(
  overrides: Partial<LegalIntelligenceSourceRow> &
    Pick<LegalIntelligenceSourceRow, "id" | "title">,
): LegalIntelligenceSourceRow {
  return {
    sourceUrl: "https://legalinfo.mn/law/example",
    documentType: null,
    validFrom: null,
    validTo: null,
    version: 1,
    sourceId: null,
    lawId: null,
    sourceExcerpt: null,
    ...overrides,
  };
}

describe("legal intelligence classification", () => {
  it("leaves every section empty when there is no usable source data", () => {
    expect(classifyLegalIntelligence([])).toEqual(emptyLegalIntelligenceFeed());
    expect(
      classifyLegalIntelligence([
        row({ id: "blank", title: "   " }),
        row({
          id: "commentary",
          title: "Commentary note",
          documentType: "COMMENTARY",
        }),
      ]),
    ).toEqual(emptyLegalIntelligenceFeed());
  });

  it("places clean law metadata into enacted laws", () => {
    const feed = classifyLegalIntelligence([
      row({
        id: "law-1",
        title: "Иргэний хууль",
        documentType: "LAW",
        validFrom: "2024-06-01",
        sourceExcerpt:
          "Энэ хуулийн зорилго нь иргэний эрх зүйн харилцааг зохицуулахад оршино.",
      }),
      row({
        id: "court-1",
        title: "A court judgment",
        documentType: "COURT_DECISION",
        validFrom: "2023-01-15",
      }),
      row({
        id: "amend-1",
        title: "Amended labor law",
        documentType: "LABOR_LAW",
        validFrom: "2022-03-01",
        version: 2,
      }),
    ]);

    expect(feed.bySection.enactedLaws.map((item) => item.title)).toEqual([
      "Иргэний хууль",
    ]);
    expect(feed.bySection.enactedLaws[0]).toMatchObject({
      id: "law-1",
      date: "2024-06-01",
      sourceUrl: "https://legalinfo.mn/law/example",
      detailHref: "/intelligence/law-1",
      category: LegalIntelligenceCategory.ENACTED_LAW,
    });
    expect(feed.bySection.courtDecisions.map((item) => item.title)).toEqual([
      "A court judgment",
    ]);
    expect(feed.bySection.amendments.map((item) => item.title)).toEqual([
      "Amended labor law",
    ]);
    expect(feed.bySection.draftBills).toEqual([]);
    expect(feed.bySection.discussion).toEqual([]);
    expect(feed.bySection.highlights).toEqual([]);
    expect(feed.availableCategories).toEqual([
      "enactedLaws",
      "courtDecisions",
      "amendments",
    ]);
    expect(feed.latest.map((item) => item.id)).toEqual([
      "law-1",
      "court-1",
      "amend-1",
    ]);
  });

  it("does not classify repeal / invalidation acts as newly enacted laws", () => {
    const feed = classifyLegalIntelligence([
      row({
        id: "repeal-1",
        title:
          "ГААЛИЙН АЛБАН ТАТВАРЫГ ХӨНГӨЛӨХ ТУХАЙ ХУУЛЬ ХҮЧИНГҮЙ БОЛСОНД ТООЦОХ ТУХАЙ",
        documentType: "LAW",
        validFrom: "2024-11-08",
        sourceExcerpt:
          "2024 оны 11 дүгээр сарын 08-ны өдөр баталсан Гаалийн албан татварыг хөнгөлөх тухай хуулийг хүчингүй болсонд тооцсугай.",
      }),
      row({
        id: "amend-title",
        title: "ИРГЭНИЙ ХУУЛЬД НЭМЭЛТ, ӨӨРЧЛӨЛТ ОРУУЛАХ ТУХАЙ",
        documentType: "LAW",
        validFrom: "2023-05-01",
      }),
      row({
        id: "clean",
        title: "ЗӨРЧИЛ ШАЛГАН ШИЙДВЭРЛЭХ ТУХАЙ",
        documentType: "LAW",
        validFrom: "2024-01-01",
      }),
    ]);

    expect(feed.bySection.enactedLaws.map((item) => item.id)).toEqual([
      "clean",
    ]);
    expect(feed.bySection.amendments.map((item) => item.id).sort()).toEqual([
      "amend-title",
      "repeal-1",
    ]);
    expect(
      toLegalIntelligenceRecord(
        row({
          id: "repeal-1",
          title: "ХУУЛЬ ХҮЧИНГҮЙ БОЛСОНД ТООЦОХ ТУХАЙ",
          documentType: "LAW",
        }),
      )?.status,
    ).toBe(LegalIntelligenceStatus.UNKNOWN);
  });

  it("includes undated clean laws without inventing enactment dates", () => {
    const feed = classifyLegalIntelligence([
      row({ id: "undated", title: "Undated law", documentType: "LAW" }),
    ]);
    expect(feed.bySection.enactedLaws).toHaveLength(1);
    expect(feed.bySection.enactedLaws[0]?.date).toBeNull();
    expect(feed.bySection.enactedLaws[0]?.title).toBe("Undated law");
  });

  it("never invents summaries — only keeps source excerpts of sufficient length", () => {
    const short = toLegalIntelligenceRecord(
      row({
        id: "short",
        title: "Short excerpt law",
        documentType: "LAW",
        sourceExcerpt: "Too short",
      }),
    );
    const long = toLegalIntelligenceRecord(
      row({
        id: "long",
        title: "Long excerpt law",
        documentType: "LAW",
        sourceExcerpt:
          "Энэ хуулийн зорилго нь иргэний эрх зүйн харилцааг зохицуулахад оршино.",
      }),
    );

    expect(short?.summary).toBeNull();
    expect(long?.summary).toContain("зорилго");
    expect(long?.status).toBe(LegalIntelligenceStatus.IN_FORCE);
  });

  it("rejects non-http source URLs", () => {
    expect(
      toLegalIntelligenceRecord(
        row({
          id: "bad-url",
          title: "Law without source",
          documentType: "LAW",
          sourceUrl: "legalinfo.mn/no-scheme",
        }),
      ),
    ).toBeNull();
  });

  it("builds a compact feed with section limits", () => {
    const records = Array.from({ length: 8 }, (_, index) =>
      toLegalIntelligenceRecord(
        row({
          id: `law-${index}`,
          title: `Law ${index}`,
          documentType: "LAW",
          validFrom: `2024-0${(index % 9) + 1}-01`,
        }),
      ),
    ).filter((record) => record !== null);

    const feed = buildLegalIntelligenceFeed(records);
    expect(feed.bySection.enactedLaws.length).toBeLessThanOrEqual(5);
    expect(feed.latest.length).toBeLessThanOrEqual(12);
    expect(feed.totalCount).toBe(feed.latest.length);
  });

  it("sorts ties with locale-independent title order", () => {
    const feed = buildLegalIntelligenceFeed(
      [
        toLegalIntelligenceRecord(
          row({ id: "b", title: "Beta law", documentType: "LAW" }),
        ),
        toLegalIntelligenceRecord(
          row({ id: "a", title: "Alpha law", documentType: "LAW" }),
        ),
      ].filter((record) => record !== null),
    );
    expect(feed.latest.map((item) => item.title)).toEqual([
      "Alpha law",
      "Beta law",
    ]);
  });
});
