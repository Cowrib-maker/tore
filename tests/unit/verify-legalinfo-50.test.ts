import { describe, expect, it } from "vitest";

import {
  KnowledgeDocumentKind,
  LEGALINFO_CONSTITUTION_LAW_ID,
  LEGALINFO_VERIFY_50_LAW_IDS,
  LEGALINFO_VERIFY_LAW_IDS,
} from "@/engine/knowledge";
import {
  applyDuplicateDetection,
  evaluateIngestedLaw,
  summarizeReports,
  type LawVerificationReport,
} from "../../scripts/lib/legalinfo-batch-verify";

function baseReport(
  overrides: Partial<LawVerificationReport>,
): LawVerificationReport {
  return {
    lawId: "1",
    url: "https://legalinfo.mn/mn/detail?lawId=1",
    httpStatus: 200,
    httpSuccess: true,
    byteSize: 1000,
    title: "TEST",
    articleCount: 2,
    chunkCount: 3,
    sha256: "abc",
    ingestionStatus: "SUCCESS",
    failureReason: null,
    duplicateOfLawId: null,
    ...overrides,
  };
}

describe("LEGALINFO_VERIFY_50_LAW_IDS", () => {
  it("contains exactly 50 unique ids including the 5-law control set", () => {
    expect(LEGALINFO_VERIFY_50_LAW_IDS).toHaveLength(50);
    expect(new Set(LEGALINFO_VERIFY_50_LAW_IDS).size).toBe(50);
    expect(LEGALINFO_VERIFY_50_LAW_IDS[0]).toBe(LEGALINFO_CONSTITUTION_LAW_ID);
    for (const id of LEGALINFO_VERIFY_LAW_IDS) {
      expect(LEGALINFO_VERIFY_50_LAW_IDS).toContain(id);
    }
  });
});

describe("legalinfo batch verify helpers", () => {
  it("marks zero-article legislation as FAILURE, never SUCCESS", () => {
    const evaluated = evaluateIngestedLaw({
      stored: {
        id: "x",
        sourceId: "legalinfo",
        sourceUrl: "https://legalinfo.mn/mn/detail?lawId=1",
        title: "ХООСОН ТУХАЙ",
        kind: KnowledgeDocumentKind.HTML,
        metadata: {
          title: "ХООСОН ТУХАЙ",
          language: "mn",
          jurisdiction: "MN",
          documentType: "law",
          sourceUrl: "https://legalinfo.mn/mn/detail?lawId=1",
          articleCount: 0,
        },
        articles: [],
        chunks: [],
        ingestedAt: new Date(),
      },
      archiveSha256: "deadbeef",
      contentSha256: "deadbeef",
    });
    expect(evaluated.ingestionStatus).toBe("FAILURE");
    expect(evaluated.failureReason).toMatch(/article count is 0/i);
  });

  it("detects duplicate SHA-256 without rewriting the first SUCCESS", () => {
    const reports = applyDuplicateDetection([
      baseReport({ lawId: "10", sha256: "same-hash" }),
      baseReport({ lawId: "20", sha256: "same-hash", title: "COPY" }),
      baseReport({ lawId: "30", sha256: "other-hash" }),
    ]);
    expect(reports[0]?.ingestionStatus).toBe("SUCCESS");
    expect(reports[1]?.ingestionStatus).toBe("DUPLICATE");
    expect(reports[1]?.duplicateOfLawId).toBe("10");
    expect(reports[2]?.ingestionStatus).toBe("SUCCESS");

    const summary = summarizeReports(reports);
    expect(summary).toEqual({
      total: 3,
      success: 2,
      failed: 0,
      duplicates: 1,
      totalArticles: 4,
      totalChunks: 6,
    });
  });

  it("keeps prior FAILURE rows when summarizing mixed outcomes", () => {
    const summary = summarizeReports([
      baseReport({ lawId: "1", ingestionStatus: "SUCCESS" }),
      baseReport({
        lawId: "2",
        ingestionStatus: "FAILURE",
        failureReason: "HTTP crawl returned no document",
        articleCount: null,
        chunkCount: null,
        sha256: null,
      }),
      baseReport({
        lawId: "3",
        ingestionStatus: "DUPLICATE",
        duplicateOfLawId: "1",
        sha256: "abc",
      }),
    ]);
    expect(summary.total).toBe(3);
    expect(summary.success).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.duplicates).toBe(1);
  });
});
