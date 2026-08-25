import { describe, expect, it } from "vitest";

import {
  classifyLegalIntelligence,
  emptyLegalIntelligenceFeed,
  type LegalIntelligenceSourceRow,
} from "@/domain/legal-intelligence";

function row(
  overrides: Partial<LegalIntelligenceSourceRow> & Pick<LegalIntelligenceSourceRow, "title">,
): LegalIntelligenceSourceRow {
  return {
    sourceUrl: "https://legalinfo.mn/law/example",
    documentType: null,
    validFrom: null,
    version: 1,
    ...overrides,
  };
}

describe("legal intelligence classification", () => {
  it("leaves every section empty when there is no usable source data", () => {
    expect(classifyLegalIntelligence([])).toEqual(emptyLegalIntelligenceFeed());
    expect(
      classifyLegalIntelligence([
        row({ title: "   " }),
        row({ title: "Commentary note", documentType: "COMMENTARY" }),
      ]),
    ).toEqual(emptyLegalIntelligenceFeed());
  });

  it("places existing law metadata into enacted laws and keeps unknown feeds empty", () => {
    const feed = classifyLegalIntelligence([
      row({
        title: "Иргэний хууль",
        documentType: "LAW",
        validFrom: "2024-06-01",
      }),
      row({
        title: "A court judgment",
        documentType: "COURT_DECISION",
        validFrom: "2023-01-15",
      }),
      row({
        title: "Amended labor law",
        documentType: "LABOR_LAW",
        validFrom: "2022-03-01",
        version: 2,
      }),
    ]);

    expect(feed.enactedLaws).toEqual([
      {
        title: "Иргэний хууль",
        date: "2024-06-01",
        sourceUrl: "https://legalinfo.mn/law/example",
      },
    ]);
    expect(feed.courtDecisions.map((item) => item.title)).toEqual([
      "A court judgment",
    ]);
    expect(feed.amendments.map((item) => item.title)).toEqual([
      "Amended labor law",
    ]);
    expect(feed.draftBills).toEqual([]);
    expect(feed.discussion).toEqual([]);
    expect(feed.highlights).toEqual([]);
  });

  it("does not invent enactment dates from missing validFrom values", () => {
    const feed = classifyLegalIntelligence([
      row({ title: "Undated law", documentType: "LAW", validFrom: null }),
    ]);
    expect(feed.enactedLaws).toEqual([]);
  });
});
