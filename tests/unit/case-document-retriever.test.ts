import { describe, expect, it } from "vitest";

import { retrieveCaseDocumentExcerpts } from "@/application/case-ai/case-document-retriever";
import type { CaseEvidenceRecord } from "@/domain/entities/case-file";

function evidence(overrides: Partial<CaseEvidenceRecord> = {}): CaseEvidenceRecord {
  const now = new Date();
  return {
    id: "ev-1",
    caseFileId: "case-1",
    title: "Гэрээ.pdf",
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

describe("retrieveCaseDocumentExcerpts", () => {
  it("returns nothing for empty evidence list", () => {
    expect(retrieveCaseDocumentExcerpts([], "гэрээ зөрчсөн")).toEqual([]);
  });

  it("returns nothing for a blank query even with readable evidence", () => {
    const result = retrieveCaseDocumentExcerpts(
      [evidence({ extractStatus: "OK", extractedText: "Талуудын хооронд байгуулсан худалдааны гэрээ." })],
      "   ",
    );
    expect(result).toEqual([]);
  });

  it("excludes evidence that is not extractStatus OK", () => {
    const items = [
      evidence({ id: "ev-failed", extractStatus: "FAILED", extractedText: "" }),
      evidence({ id: "ev-empty", extractStatus: "EMPTY", extractedText: "" }),
      evidence({ id: "ev-ocr", extractStatus: "NEEDS_OCR", extractedText: "" }),
      evidence({ id: "ev-null", extractStatus: null, extractedText: "гэрээ зөрчсөн байна" }),
    ];
    expect(retrieveCaseDocumentExcerpts(items, "гэрээ")).toEqual([]);
  });

  it("excludes an OK evidence row whose extracted text is only whitespace", () => {
    const items = [evidence({ extractStatus: "OK", extractedText: "   \n  " })];
    expect(retrieveCaseDocumentExcerpts(items, "гэрээ")).toEqual([]);
  });

  it("scores and ranks chunks by keyword relevance, best first", () => {
    const items = [
      evidence({
        id: "ev-low",
        title: "Тайлан.pdf",
        extractStatus: "OK",
        extractedText:
          "Энэ бол огт өөр агуулгатай тайлан бөгөөд танилцуулах зорилготой.",
      }),
      evidence({
        id: "ev-high",
        title: "Гэрээ.pdf",
        extractStatus: "OK",
        extractedText:
          "Худалдагч худалдан авагчид машиныг шилжүүлэх үүрэгтэй. Гэрээ зөрчигдсөн тохиолдолд торгууль ногдуулна. Гэрээний нөхцөл зөрчигдсөн.",
      }),
    ];
    const result = retrieveCaseDocumentExcerpts(items, "гэрээ зөрчигдсөн");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.sourceEvidenceId).toBe("ev-high");
    expect(result[0]?.relevanceScore).toBeGreaterThan(0);
    for (let i = 1; i < result.length; i += 1) {
      expect(result[i - 1]!.relevanceScore).toBeGreaterThanOrEqual(
        result[i]!.relevanceScore,
      );
    }
  });

  it("bounds results to maxResults", () => {
    const longText = Array.from({ length: 40 }, (_, i) => `гэрээний зүйл ${i} зөрчигдсөн`).join(" ");
    const items = [evidence({ extractStatus: "OK", extractedText: longText })];
    const result = retrieveCaseDocumentExcerpts(items, "гэрээ зөрчигдсөн", {
      maxResults: 3,
      chunkSize: 80,
      chunkOverlap: 10,
    });
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("chunks long text into multiple overlapping windows", () => {
    const longText = "гэрээ ".repeat(500).trim();
    const items = [evidence({ extractStatus: "OK", extractedText: longText })];
    const result = retrieveCaseDocumentExcerpts(items, "гэрээ", {
      maxResults: 50,
      chunkSize: 200,
      chunkOverlap: 20,
    });
    expect(result.length).toBeGreaterThan(1);
    for (const excerpt of result) {
      expect(excerpt.excerpt.length).toBeLessThanOrEqual(200);
    }
  });

  it("retains sourceEvidenceId, sourceTitle, chunkStart, and relevanceScore per excerpt", () => {
    const items = [
      evidence({
        id: "ev-x",
        title: "Нотариатын гэрчилгээ.pdf",
        extractStatus: "OK",
        extractedText: "Гэрээ байгуулагдсан огноо: 2025 он. Гэрээ хүчинтэй.",
      }),
    ];
    const result = retrieveCaseDocumentExcerpts(items, "гэрээ");
    expect(result[0]).toMatchObject({
      sourceEvidenceId: "ev-x",
      sourceTitle: "Нотариатын гэрчилгээ.pdf",
    });
    expect(typeof result[0]?.chunkStart).toBe("number");
    expect(typeof result[0]?.relevanceScore).toBe("number");
  });

  it("ignores stopwords and very short tokens when scoring", () => {
    const items = [
      evidence({
        extractStatus: "OK",
        extractedText: "нь энэ тэр бол бас гэрээ зөрчигдсөн",
      }),
    ];
    // Querying only with stopwords should find nothing, since they carry
    // no scoring weight and no other keyword exists to match against.
    const result = retrieveCaseDocumentExcerpts(items, "нь энэ тэр бол");
    expect(result).toEqual([]);
  });

  it("draws excerpts from multiple evidence documents independently", () => {
    const items = [
      evidence({
        id: "ev-a",
        title: "A.pdf",
        extractStatus: "OK",
        extractedText: "Гэрээний эхний хэсэгт зөрчил гарсан.",
      }),
      evidence({
        id: "ev-b",
        title: "B.pdf",
        extractStatus: "OK",
        extractedText: "Хоёр дахь баримт бичигт мөн зөрчил дурдагдсан.",
      }),
    ];
    const result = retrieveCaseDocumentExcerpts(items, "зөрчил", { maxResults: 10 });
    const sourceIds = new Set(result.map((r) => r.sourceEvidenceId));
    expect(sourceIds.has("ev-a")).toBe(true);
    expect(sourceIds.has("ev-b")).toBe(true);
  });
});
