/**
 * Shared LegalInfo batch verification runner.
 *
 * Same production path as the 5-law verify script:
 * HttpKnowledgeCrawler → archive → LegalInfoKnowledgeParser →
 * normalize → metadata → chunk → in-memory repository.
 *
 * Does not change createKnowledgeEngine() defaults.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  createArchiveService,
  InMemoryArchiveRepository,
  LocalFilesystemArchiveStorage,
  contentSha256Hex,
  sha256Hex,
  type ArchiveService,
} from "../../src/engine/data/archive";
import {
  createKnowledgeEngine,
  HttpKnowledgeCrawler,
  InMemoryKnowledgeCrawler,
  InMemoryKnowledgeRepository,
  LEGALINFO_CONSTITUTION_LAW_ID,
  LegalInfoKnowledgeParser,
  legalInfoDetailUrl,
  type FetchLike,
  type RawKnowledgeDocument,
  type StoredKnowledgeDocument,
} from "../../src/engine/knowledge";

export type LawIngestionStatus = "SUCCESS" | "FAILURE" | "DUPLICATE";

export type LawVerificationReport = {
  lawId: string;
  url: string;
  httpStatus: number | null;
  httpSuccess: boolean;
  byteSize: number | null;
  title: string | null;
  articleCount: number | null;
  chunkCount: number | null;
  sha256: string | null;
  ingestionStatus: LawIngestionStatus;
  failureReason: string | null;
  duplicateOfLawId: string | null;
};

export type LegalInfoBatchVerifySummary = {
  total: number;
  success: number;
  failed: number;
  duplicates: number;
  totalArticles: number;
  totalChunks: number;
};

export type LegalInfoBatchVerifyResult = {
  reports: LawVerificationReport[];
  summary: LegalInfoBatchVerifySummary;
  reportPath: string | null;
};

export type LegalInfoBatchVerifyOptions = {
  lawIds: readonly string[];
  /** Expected set size (5 or 50). */
  expectedCount: number;
  archiveDir: string;
  /** JSON report output path. */
  reportPath?: string;
  /** Pause between fetches (ms). Default 250. */
  requestDelayMs?: number;
  /** Per-request timeout (ms). Default 60_000 for large statutes. */
  timeoutMs?: number;
  /** Injectable fetch (tests). */
  fetchImpl?: FetchLike;
  /** Print per-law lines to stdout. Default true. */
  printEach?: boolean;
};

function lawIdFromUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get("lawId");
  } catch {
    return null;
  }
}

function parseHttpStatusFromError(message: string): number | null {
  const match = message.match(/\bHTTP\s+(\d{3})\b/i);
  if (!match?.[1]) {
    return null;
  }
  return Number.parseInt(match[1], 10);
}

export function evaluateIngestedLaw(input: {
  stored: StoredKnowledgeDocument | undefined;
  archiveSha256: string | null;
  contentSha256: string;
  archiveContentSha256?: string | null;
}): Pick<
  LawVerificationReport,
  "title" | "articleCount" | "chunkCount" | "ingestionStatus" | "failureReason"
> {
  const { stored, archiveSha256, contentSha256, archiveContentSha256 } = input;
  if (!stored) {
    return {
      title: null,
      articleCount: null,
      chunkCount: null,
      ingestionStatus: "FAILURE",
      failureReason: "ingestion produced no stored document",
    };
  }

  const title = stored.title?.trim() ?? "";
  const articleCount = stored.articles.length;
  const chunkCount = stored.chunks.length;

  if (!archiveSha256) {
    return {
      title,
      articleCount,
      chunkCount,
      ingestionStatus: "FAILURE",
      failureReason: "missing archive checksum",
    };
  }
  if (archiveContentSha256) {
    if (archiveContentSha256 !== contentSha256) {
      return {
        title,
        articleCount,
        chunkCount,
        ingestionStatus: "FAILURE",
        failureReason: "archive checksum mismatch",
      };
    }
  } else if (archiveSha256 !== contentSha256) {
    return {
      title,
      articleCount,
      chunkCount,
      ingestionStatus: "FAILURE",
      failureReason: "archive checksum mismatch",
    };
  }
  if (!title) {
    return {
      title,
      articleCount,
      chunkCount,
      ingestionStatus: "FAILURE",
      failureReason: "empty title",
    };
  }
  if (articleCount === 0) {
    return {
      title,
      articleCount,
      chunkCount,
      ingestionStatus: "FAILURE",
      failureReason: "parser/source-structure failure: article count is 0",
    };
  }
  if (chunkCount === 0) {
    return {
      title,
      articleCount,
      chunkCount,
      ingestionStatus: "FAILURE",
      failureReason: "chunk count is 0",
    };
  }

  return {
    title,
    articleCount,
    chunkCount,
    ingestionStatus: "SUCCESS",
    failureReason: null,
  };
}

/**
 * Mark later laws that share SHA-256 with an earlier SUCCESS as DUPLICATE.
 * Does not rewrite prior SUCCESS rows.
 */
export function applyDuplicateDetection(
  reports: LawVerificationReport[],
): LawVerificationReport[] {
  const firstByHash = new Map<string, string>();
  return reports.map((report) => {
    if (
      report.ingestionStatus !== "SUCCESS" ||
      !report.sha256 ||
      report.sha256.length === 0
    ) {
      return report;
    }
    const prior = firstByHash.get(report.sha256);
    if (!prior) {
      firstByHash.set(report.sha256, report.lawId);
      return report;
    }
    return {
      ...report,
      ingestionStatus: "DUPLICATE",
      failureReason: `duplicate content SHA-256 matches lawId=${prior}`,
      duplicateOfLawId: prior,
    };
  });
}

export function summarizeReports(
  reports: LawVerificationReport[],
): LegalInfoBatchVerifySummary {
  let success = 0;
  let failed = 0;
  let duplicates = 0;
  let totalArticles = 0;
  let totalChunks = 0;
  for (const report of reports) {
    if (report.ingestionStatus === "SUCCESS") {
      success += 1;
      totalArticles += report.articleCount ?? 0;
      totalChunks += report.chunkCount ?? 0;
    } else if (report.ingestionStatus === "DUPLICATE") {
      duplicates += 1;
    } else {
      failed += 1;
    }
  }
  return {
    total: reports.length,
    success,
    failed,
    duplicates,
    totalArticles,
    totalChunks,
  };
}

function printReport(report: LawVerificationReport): void {
  console.log("----------------------");
  console.log(`lawId: ${report.lawId}`);
  console.log(`URL: ${report.url}`);
  console.log(`HTTP status: ${report.httpStatus ?? "(n/a)"}`);
  console.log(`HTTP success: ${report.httpSuccess}`);
  console.log(`byte size: ${report.byteSize ?? "(n/a)"}`);
  console.log(`SHA-256: ${report.sha256 ?? "(n/a)"}`);
  console.log(`title: ${report.title ?? "(n/a)"}`);
  console.log(`article count: ${report.articleCount ?? "(n/a)"}`);
  console.log(`chunk count: ${report.chunkCount ?? "(n/a)"}`);
  console.log(`ingestion status: ${report.ingestionStatus}`);
  if (report.failureReason) {
    console.log(`failure reason: ${report.failureReason}`);
  }
  if (report.duplicateOfLawId) {
    console.log(`duplicate of: ${report.duplicateOfLawId}`);
  }
}

function printSummary(summary: LegalInfoBatchVerifySummary): void {
  console.log("============================");
  console.log(`TOTAL: ${summary.total}`);
  console.log(`SUCCESS: ${summary.success}`);
  console.log(`FAILED: ${summary.failed}`);
  console.log(`DUPLICATES: ${summary.duplicates}`);
  console.log(`TOTAL ARTICLES: ${summary.totalArticles}`);
  console.log(`TOTAL CHUNKS: ${summary.totalChunks}`);
}

function printFailureTable(reports: LawVerificationReport[]): void {
  const failures = reports.filter((r) => r.ingestionStatus !== "SUCCESS");
  console.log("============================");
  console.log("Failure / duplicate table");
  console.log("lawId\tstatus\treason");
  if (failures.length === 0) {
    console.log("(none)");
    return;
  }
  for (const row of failures) {
    console.log(
      `${row.lawId}\t${row.ingestionStatus}\t${row.failureReason ?? ""}`,
    );
  }
}

export async function runLegalInfoBatchVerify(
  options: LegalInfoBatchVerifyOptions,
): Promise<LegalInfoBatchVerifyResult> {
  const lawIds = [...options.lawIds];
  if (lawIds.length !== options.expectedCount) {
    throw new Error(
      `Expected exactly ${options.expectedCount} law IDs, got ${lawIds.length}`,
    );
  }
  if (!lawIds.includes(LEGALINFO_CONSTITUTION_LAW_ID)) {
    throw new Error("Verification set must include lawId=367 control");
  }

  const urls = lawIds.map((id) => legalInfoDetailUrl(id));
  const archiveRepository = new InMemoryArchiveRepository();
  const archive: ArchiveService = createArchiveService({
    repository: archiveRepository,
    storage: new LocalFilesystemArchiveStorage(options.archiveDir),
  });

  // Assert default wiring is unchanged.
  const defaultProbe = await createKnowledgeEngine().ingest({
    sourceId: "legalinfo",
  });
  if (defaultProbe.ingested.length !== 0) {
    throw new Error("Unexpected: default engine should start empty");
  }

  const crawlErrors = new Map<string, string>();
  const httpCrawler = new HttpKnowledgeCrawler({
    lawIds,
    archive,
    fetchImpl: options.fetchImpl,
    requestDelayMs: options.requestDelayMs ?? 250,
    timeoutMs: options.timeoutMs ?? 60_000,
    onDocumentError: ({ sourceUrl, error }) => {
      crawlErrors.set(
        sourceUrl,
        error instanceof Error ? error.message : String(error),
      );
    },
  });

  const rawDocuments = await httpCrawler.crawl({
    sourceId: "legalinfo",
    urls,
    maxDocuments: options.expectedCount,
  });

  const rawByLawId = new Map<string, RawKnowledgeDocument>();
  for (const raw of rawDocuments) {
    const id = lawIdFromUrl(raw.sourceUrl);
    if (id) {
      rawByLawId.set(id, raw);
    }
  }

  const repository = new InMemoryKnowledgeRepository();
  const engine = createKnowledgeEngine({
    crawler: new InMemoryKnowledgeCrawler(rawDocuments),
    parser: new LegalInfoKnowledgeParser(),
    repository,
  });

  const ingestResult = await engine.ingest({
    sourceId: "legalinfo",
    urls,
    maxDocuments: options.expectedCount,
  });

  const storedByUrl = new Map(
    ingestResult.ingested.map((doc) => [doc.sourceUrl, doc] as const),
  );
  const ingestFailByUrl = new Map(
    ingestResult.failed.map((f) => [f.sourceUrl, f.reason] as const),
  );

  const reports: LawVerificationReport[] = [];

  for (const lawId of lawIds) {
    const url = legalInfoDetailUrl(lawId);
    const raw = rawByLawId.get(lawId);

    if (!raw) {
      const crawlReason = crawlErrors.get(url);
      reports.push({
        lawId,
        url,
        httpStatus: crawlReason
          ? parseHttpStatusFromError(crawlReason)
          : null,
        httpSuccess: false,
        byteSize: null,
        title: null,
        articleCount: null,
        chunkCount: null,
        sha256: null,
        ingestionStatus: "FAILURE",
        failureReason: crawlReason ?? "HTTP crawl returned no document",
        duplicateOfLawId: null,
      });
      continue;
    }

    const rawHash = sha256Hex(raw.bytes);
    const canonicalHash = contentSha256Hex(raw.bytes);
    const archiveRecord =
      (await archive.findByHash(rawHash)) ??
      (await archive.findByContentHash(canonicalHash));
    const archiveSha256 = archiveRecord?.sha256 ?? null;

    const ingestError = ingestFailByUrl.get(url);
    if (ingestError) {
      reports.push({
        lawId,
        url,
        httpStatus: 200,
        httpSuccess: true,
        byteSize: raw.bytes.byteLength,
        title: null,
        articleCount: null,
        chunkCount: null,
        sha256: canonicalHash,
        ingestionStatus: "FAILURE",
        failureReason: ingestError,
        duplicateOfLawId: null,
      });
      continue;
    }

    const evaluated = evaluateIngestedLaw({
      stored: storedByUrl.get(url),
      archiveSha256,
      contentSha256: canonicalHash,
      archiveContentSha256: archiveRecord?.contentSha256 ?? null,
    });

    reports.push({
      lawId,
      url,
      httpStatus: 200,
      httpSuccess: true,
      byteSize: raw.bytes.byteLength,
      sha256: canonicalHash,
      duplicateOfLawId: null,
      ...evaluated,
    });
  }

  const withDuplicates = applyDuplicateDetection(reports);
  const summary = summarizeReports(withDuplicates);

  if (options.printEach !== false) {
    for (const report of withDuplicates) {
      printReport(report);
    }
  }
  printSummary(summary);
  printFailureTable(withDuplicates);

  let reportPath: string | null = null;
  if (options.reportPath) {
    reportPath = options.reportPath;
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(
      reportPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          expectedCount: options.expectedCount,
          summary,
          reports: withDuplicates,
        },
        null,
        2,
      ),
      "utf8",
    );
    console.log(`JSON report: ${reportPath}`);
  }

  return { reports: withDuplicates, summary, reportPath };
}
