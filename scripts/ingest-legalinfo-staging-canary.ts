/**
 * STAGING-ONLY LegalInfo runner for an explicit operator-supplied lawId list.
 *
 * Structural article checks (unchanged):
 *   367  — articles 1 and 12
 *   11634 — articles 17.1 and 17.2; must not invent integer 17
 * 11634 is not selected as the current Criminal Code.
 *
 * Loads `.env.staging` only. Never loads `.env`.
 * discovery manifest: not used (no mutation)
 * Fetches only --law-ids. Does not run the remaining corpus.
 *
 * Usage:
 *   npm run ingest:legalinfo:staging-canary -- --law-ids=367,11634
 *   npm run ingest:legalinfo:staging-canary -- --law-ids=367,439,123,400
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  contentSha256Hex,
  createArchiveService,
  S3ArchiveStorage,
  sha256Hex,
} from "../src/engine/data/archive";
import {
  createKnowledgeEngine,
  HttpKnowledgeCrawler,
  InMemoryKnowledgeCrawler,
  InMemoryKnowledgeRepository,
  LEGALINFO_INGESTION_DEFAULT_TIMEOUT_MS,
  LegalInfoKnowledgeParser,
  legalInfoDetailUrl,
  type RawKnowledgeDocument,
  type StoredKnowledgeDocument,
} from "../src/engine/knowledge";
import { PrismaArchiveRepository } from "../src/infrastructure/archive/prisma-archive.repository";
import { PrismaKnowledgeRepository } from "../src/infrastructure/repositories/prisma-legal-knowledge-repository";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  STAGING_ARCHIVE_S3_PREFIX,
  STAGING_NEON_HOST,
  StagingCanaryGuardError,
  assertStagingCanaryEnv,
  evaluateStagingCanaryArticles,
  loadStagingEnvFile,
  parseHttpStatusFromError,
  parseStagingLawIds,
  type StagingCanaryEnv,
} from "./lib/legalinfo-staging-canary";

const REPORT_PATH = join(
  process.cwd(),
  "tmp",
  "legalinfo-staging-canary-report.json",
);

type LawCanaryReport = {
  lawId: string;
  url: string;
  title: string | null;
  httpStatus: number | null;
  byteSize: number | null;
  rawSha256: string | null;
  contentSha256: string | null;
  archiveId: string | null;
  knowledgeDocumentId: string | null;
  articleCount: number | null;
  chunkCount: number | null;
  hasArticle1: boolean;
  hasArticle12: boolean;
  hasArticle171: boolean;
  hasArticle172: boolean;
  hasIntegerArticle17: boolean;
  persistence: "ok" | "skipped" | "failed";
  status: "SUCCESS" | "FAILURE";
  failureReason: string | null;
};

function applyStagingEnv(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }
  delete process.env.DOTENV_CONFIG_PATH;
}

async function ingestOneLaw(input: {
  lawId: string;
  archive: ReturnType<typeof createArchiveService>;
  knowledge: PrismaKnowledgeRepository;
}): Promise<LawCanaryReport> {
  const { lawId, archive, knowledge } = input;
  const url = legalInfoDetailUrl(lawId);
  const base: LawCanaryReport = {
    lawId,
    url,
    title: null,
    httpStatus: null,
    byteSize: null,
    rawSha256: null,
    contentSha256: null,
    archiveId: null,
    knowledgeDocumentId: null,
    articleCount: null,
    chunkCount: null,
    hasArticle1: false,
    hasArticle12: false,
    hasArticle171: false,
    hasArticle172: false,
    hasIntegerArticle17: false,
    persistence: "skipped",
    status: "FAILURE",
    failureReason: null,
  };

  const crawlErrors: string[] = [];
  const crawler = new HttpKnowledgeCrawler({
    lawIds: [lawId],
    archive,
    maxRetries: 2,
    timeoutMs: LEGALINFO_INGESTION_DEFAULT_TIMEOUT_MS,
    requestDelayMs: 0,
    onDocumentError: ({ error }) => {
      crawlErrors.push(error instanceof Error ? error.message : String(error));
    },
  });

  let rawDocuments: RawKnowledgeDocument[] = [];
  try {
    rawDocuments = await crawler.crawl({
      sourceId: "legalinfo",
      urls: [url],
      maxDocuments: 1,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      httpStatus: parseHttpStatusFromError(message),
      failureReason: message,
    };
  }

  if (rawDocuments.length === 0) {
    const message = crawlErrors[0] ?? "HTTP crawl returned no document";
    return {
      ...base,
      httpStatus: parseHttpStatusFromError(message),
      failureReason: message,
    };
  }

  const raw = rawDocuments[0]!;
  const rawSha256 = sha256Hex(raw.bytes);
  const contentSha256 = contentSha256Hex(raw.bytes);
  base.httpStatus = 200;
  base.byteSize = raw.bytes.byteLength;
  base.rawSha256 = rawSha256;
  base.contentSha256 = contentSha256;

  const stored = await archive.store({
    bytes: raw.bytes,
    connectorId: "mn.legalinfo",
    source: "legalinfo.mn",
    sourceId: "legalinfo",
    lawId,
    jurisdiction: "MN",
    authority: "LEGALINFO",
    sourceType: "law",
    originalUrl: url,
    originalFileName: "legalinfo-detail.html",
    mimeType: raw.contentType ?? "text/html",
    encoding: "utf-8",
    fetchedAt: raw.fetchedAt.toISOString(),
  });

  try {
    await archive.verifyArchiveIntegrity(stored.record.sha256);
  } catch (error) {
    return {
      ...base,
      archiveId: stored.record.archiveId,
      persistence: "failed",
      failureReason:
        error instanceof Error
          ? error.message
          : "archive integrity verification failed",
    };
  }

  if (stored.record.contentSha256 !== contentSha256) {
    return {
      ...base,
      archiveId: stored.record.archiveId,
      persistence: "failed",
      failureReason: "canonical content SHA-256 mismatch against archive record",
    };
  }
  if (stored.created && stored.record.sha256 !== rawSha256) {
    return {
      ...base,
      archiveId: stored.record.archiveId,
      persistence: "failed",
      failureReason: "raw SHA-256 must match the exact stored HTTP bytes",
    };
  }

  const engine = createKnowledgeEngine({
    crawler: new InMemoryKnowledgeCrawler([raw]),
    parser: new LegalInfoKnowledgeParser(),
    repository: new InMemoryKnowledgeRepository(),
  });
  const parsed = await engine.ingest({
    sourceId: "legalinfo",
    urls: [url],
    maxDocuments: 1,
  });
  if (parsed.failed.length > 0 || parsed.ingested.length === 0) {
    return {
      ...base,
      archiveId: stored.record.archiveId,
      persistence: "failed",
      failureReason:
        parsed.failed[0]?.reason ?? "ingestion produced no stored document",
    };
  }

  const document = parsed.ingested[0] as StoredKnowledgeDocument;
  const articleCheck = evaluateStagingCanaryArticles(lawId, document.articles);
  base.title = document.title;
  base.articleCount = document.articles.length;
  base.chunkCount = document.chunks.length;
  base.hasArticle1 = articleCheck.hasArticle1;
  base.hasArticle12 = articleCheck.hasArticle12;
  base.hasArticle171 = articleCheck.hasArticle171;
  base.hasArticle172 = articleCheck.hasArticle172;
  base.hasIntegerArticle17 = articleCheck.hasIntegerArticle17;
  base.archiveId = stored.record.archiveId;

  if (!articleCheck.ok) {
    return {
      ...base,
      persistence: "failed",
      failureReason: articleCheck.reason,
    };
  }
  if (document.chunks.length === 0) {
    return {
      ...base,
      persistence: "failed",
      failureReason: "chunk count is 0",
    };
  }

  try {
    const persisted = await knowledge.save({
      ...document,
      provenance: {
        archiveId: stored.record.archiveId,
        sha256: stored.record.sha256,
        contentSha256: stored.record.contentSha256,
        originalUrl: stored.record.originalUrl,
        lawId,
      },
    });
    return {
      ...base,
      knowledgeDocumentId: persisted.id,
      persistence: "ok",
      status: "SUCCESS",
      failureReason: null,
    };
  } catch (error) {
    return {
      ...base,
      persistence: "failed",
      failureReason: `durable knowledge persistence failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

function printLawReport(report: LawCanaryReport): void {
  console.log(`--- lawId ${report.lawId} ---`);
  console.log(`title: ${report.title ?? "(none)"}`);
  console.log(`HTTP status: ${report.httpStatus ?? "(none)"}`);
  console.log(`byte size: ${report.byteSize ?? "(none)"}`);
  console.log(`raw SHA-256: ${report.rawSha256 ?? "(none)"}`);
  console.log(`canonical content SHA-256: ${report.contentSha256 ?? "(none)"}`);
  console.log(`archive ID: ${report.archiveId ?? "(none)"}`);
  console.log(`knowledge document ID: ${report.knowledgeDocumentId ?? "(none)"}`);
  console.log(`article count: ${report.articleCount ?? "(none)"}`);
  console.log(`chunk count: ${report.chunkCount ?? "(none)"}`);
  if (report.lawId === "367") {
    console.log(`article 1 present: ${report.hasArticle1}`);
    console.log(`article 12 present: ${report.hasArticle12}`);
  }
  if (report.lawId === "11634") {
    console.log(`article 17.1 present: ${report.hasArticle171}`);
    console.log(`article 17.2 present: ${report.hasArticle172}`);
    console.log(`integer article 17 present: ${report.hasIntegerArticle17}`);
  }
  console.log(`persistence: ${report.persistence}`);
  console.log(`status: ${report.status}`);
  if (report.failureReason) {
    console.log(`failure: ${report.failureReason}`);
  }
}

async function main() {
  let lawIds;
  try {
    lawIds = parseStagingLawIds(process.argv.slice(2));
  } catch (error) {
    const message =
      error instanceof StagingCanaryGuardError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    console.error(message);
    process.exit(1);
    return;
  }

  let stagingEnv: StagingCanaryEnv;
  try {
    const fileValues = loadStagingEnvFile(process.cwd());
    applyStagingEnv(fileValues);
    stagingEnv = assertStagingCanaryEnv(fileValues);
  } catch (error) {
    const message =
      error instanceof StagingCanaryGuardError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    console.error(message);
    process.exit(1);
    return;
  }

  console.log("TORE staging LegalInfo canary");
  console.log(`DATABASE_URL host: ${STAGING_NEON_HOST}`);
  console.log(`ARCHIVE_S3_PREFIX: ${STAGING_ARCHIVE_S3_PREFIX}`);
  console.log(`law IDs: ${lawIds.join(", ")}`);
  console.log("discovery manifest: not used (no mutation)");

  const pool = new Pool({ connectionString: stagingEnv.DATABASE_URL });
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
    log: ["error"],
  });
  const storage = new S3ArchiveStorage({
    bucket: stagingEnv.ARCHIVE_S3_BUCKET || stagingEnv.S3_BUCKET,
    region: stagingEnv.S3_REGION,
    accessKeyId: stagingEnv.S3_ACCESS_KEY_ID,
    secretAccessKey: stagingEnv.S3_SECRET_ACCESS_KEY,
    keyPrefix: stagingEnv.ARCHIVE_S3_PREFIX,
    endpoint: stagingEnv.S3_ENDPOINT,
    forcePathStyle: stagingEnv.S3_FORCE_PATH_STYLE,
  });
  const archive = createArchiveService({
    repository: new PrismaArchiveRepository(prisma),
    storage,
  });
  const knowledge = new PrismaKnowledgeRepository(archive, prisma);

  try {
    const health = await archive.health();
    if (!health.ok) {
      console.error(`Archive storage health check failed: ${health.detail}`);
      process.exitCode = 1;
      return;
    }
    if (!health.detail.includes(STAGING_ARCHIVE_S3_PREFIX)) {
      console.error(
        `Archive health detail does not include staging prefix ${STAGING_ARCHIVE_S3_PREFIX}: ${health.detail}`,
      );
      process.exitCode = 1;
      return;
    }

    const reports: LawCanaryReport[] = [];
    for (const lawId of lawIds) {
      reports.push(
        await ingestOneLaw({
          lawId,
          archive,
          knowledge,
        }),
      );
    }

    for (const report of reports) {
      printLawReport(report);
    }

    const failed = reports.filter((report) => report.status !== "SUCCESS");
    const payload = {
      batch: "legalinfo-staging-explicit",
      databaseHost: STAGING_NEON_HOST,
      archivePrefix: STAGING_ARCHIVE_S3_PREFIX,
      selectedLawIds: lawIds,
      manifestMutated: false,
      reports,
    };
    await mkdir(join(process.cwd(), "tmp"), { recursive: true });
    await writeFile(REPORT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(`report written: ${REPORT_PATH}`);

    if (failed.length > 0) {
      console.error(
        `Staging canary FAILURE (${failed.length}/${reports.length} laws).`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `Staging canary SUCCESS (${reports.length}/${reports.length} laws).`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
