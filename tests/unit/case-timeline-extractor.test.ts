import { describe, expect, it } from "vitest";

import { extractCaseTimelineEntries } from "@/application/case-ai/case-timeline-extractor";
import { CaseTimelineConfidence } from "@/domain/entities/case-timeline";
import type { CaseEvidenceRecord } from "@/domain/entities/case-file";

function evidence(overrides: Partial<CaseEvidenceRecord> = {}): CaseEvidenceRecord {
  const now = new Date();
  return {
    id: "ev-1",
    caseFileId: "case-1",
    title: "Тайлбар.pdf",
    description: null,
    evidenceType: "DOCUMENT",
    fileReference: "key-1",
    sourceReference: null,
    extractedText: "",
    extractStatus: null,
    pageCount: null,
    createdByUserId: "lawyer-a",
    updatedByUserId: "lawyer-a",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("extractCaseTimelineEntries", () => {
  it("returns nothing for empty evidence", () => {
    expect(extractCaseTimelineEntries([])).toEqual([]);
  });

  it("skips evidence that is not extractStatus OK", () => {
    const items = [
      evidence({ extractStatus: "FAILED", extractedText: "2024 оны 5 дугаар сарын 3-нд гэрээ байгуулав." }),
      evidence({ extractStatus: null, extractedText: "2024 оны 5 дугаар сарын 3-нд гэрээ байгуулав." }),
    ];
    expect(extractCaseTimelineEntries(items)).toEqual([]);
  });

  it("parses a full Mongolian date with HIGH confidence and a resolved calendar date", () => {
    const items = [
      evidence({
        extractStatus: "OK",
        extractedText: "Талууд 2024 оны 5 дугаар сарын 3-нд худалдааны гэрээ байгуулав.",
      }),
    ];
    const [entry] = extractCaseTimelineEntries(items);
    expect(entry).toBeDefined();
    expect(entry?.confidence).toBe(CaseTimelineConfidence.HIGH);
    expect(entry?.parsedDate).toEqual(new Date(Date.UTC(2024, 4, 3)));
    expect(entry?.caseEvidenceId).toBe("ev-1");
    expect(entry?.caseFileId).toBe("case-1");
    expect(entry?.eventText).toContain("гэрээ байгуулав");
  });

  it("parses an ISO-style date with MEDIUM confidence", () => {
    const items = [
      evidence({ extractStatus: "OK", extractedText: "Огноо: 2024-05-03. Нэхэмжлэл гаргасан." }),
    ];
    const [entry] = extractCaseTimelineEntries(items);
    expect(entry?.confidence).toBe(CaseTimelineConfidence.MEDIUM);
    expect(entry?.parsedDate).toEqual(new Date(Date.UTC(2024, 4, 3)));
  });

  it("marks a bare-year mention as UNCERTAIN with no parsed date", () => {
    const items = [
      evidence({ extractStatus: "OK", extractedText: "2024 онд маргаан үүссэн байна." }),
    ];
    const [entry] = extractCaseTimelineEntries(items);
    expect(entry?.confidence).toBe(CaseTimelineConfidence.UNCERTAIN);
    expect(entry?.parsedDate).toBeNull();
  });

  it("never fabricates a parsed date for an impossible calendar date (e.g. month 13)", () => {
    const items = [
      evidence({ extractStatus: "OK", extractedText: "2024-13-40 огноогоор бүртгэгдсэн." }),
    ];
    const entries = extractCaseTimelineEntries(items);
    for (const entry of entries) {
      expect(entry.parsedDate).toBeNull();
    }
  });

  it("marks an invalid Mongolian-format date (e.g. day 32) as UNCERTAIN, not HIGH", () => {
    const items = [
      evidence({
        extractStatus: "OK",
        extractedText: "2024 оны 5 дугаар сарын 32-нд огноо буруу бичигдсэн байна.",
      }),
    ];
    const [entry] = extractCaseTimelineEntries(items);
    expect(entry?.confidence).toBe(CaseTimelineConfidence.UNCERTAIN);
    expect(entry?.parsedDate).toBeNull();
  });

  it("produces a sourceExcerpt that is an exact substring window of the original text", () => {
    const text = "Энэ өгүүлбэр эхэлнэ. 2024 оны 5 дугаар сарын 3-нд гэрээ байгуулав. Дараагийн өгүүлбэр.";
    const items = [evidence({ extractStatus: "OK", extractedText: text })];
    const [entry] = extractCaseTimelineEntries(items);
    expect(entry).toBeDefined();
    const stripped = entry!.sourceExcerpt.replace(/^…/, "").replace(/…$/, "");
    expect(text).toContain(stripped);
  });

  it("extracts multiple distinct dates from the same document without overlap", () => {
    const text =
      "2024 оны 1 дүгээр сарын 10-нд нэхэмжлэл гаргасан. 2024 оны 3 дугаар сарын 15-нд хариу өгсөн.";
    const items = [evidence({ extractStatus: "OK", extractedText: text })];
    const entries = extractCaseTimelineEntries(items);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.rawDateText).toContain("1 дүгээр сарын 10");
    expect(entries[1]?.rawDateText).toContain("3 дугаар сарын 15");
  });

  it("extracts timeline entries independently across multiple evidence documents", () => {
    const items = [
      evidence({
        id: "ev-a",
        extractStatus: "OK",
        extractedText: "2024 оны 1 дүгээр сарын 1-нд эхэлсэн.",
      }),
      evidence({
        id: "ev-b",
        extractStatus: "OK",
        extractedText: "2024 оны 2 дугаар сарын 2-нд дуусгавар болсон.",
      }),
    ];
    const entries = extractCaseTimelineEntries(items);
    expect(entries.map((e) => e.caseEvidenceId).sort()).toEqual(["ev-a", "ev-b"]);
  });

  it("returns no entries for text containing no date-like patterns", () => {
    const items = [
      evidence({ extractStatus: "OK", extractedText: "Энэ баримт бичигт огноо огт байхгүй." }),
    ];
    expect(extractCaseTimelineEntries(items)).toEqual([]);
  });
});
