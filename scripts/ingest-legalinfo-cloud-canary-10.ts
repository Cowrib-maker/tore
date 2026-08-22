/**
 * STAGING canary — next 10 PENDING LegalInfo documents with production-like
 * persistence. Does NOT start the remaining corpus.
 *
 * Command role: staging canary.
 * Persistence:
 *   Prisma archive metadata
 *   PrismaKnowledgeRepository
 *   S3/R2 blob storage (ARCHIVE_STORAGE=s3)
 *
 * Point DATABASE_URL and ARCHIVE_S3_PREFIX at a staging database and prefix.
 * Never use production credentials in tests.
 *
 * Local parser-only test (no Prisma): `npm run ingest:legalinfo:batch-10`.
 * Production remaining-corpus ingest: `npm run ingest:legalinfo:cloud`
 * (do not run until the LegalInfo production foundation is verified).
 *
 * Usage:
 *   npm run ingest:legalinfo:canary-10
 */

import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  FileLegalInfoManifestStore,
  LEGALINFO_INGESTION_CONCURRENCY,
  LEGALINFO_INGESTION_DEFAULT_REQUEST_DELAY_MS,
  LEGALINFO_INGESTION_DEFAULT_TIMEOUT_MS,
  LegalInfoDocumentStatus,
  LegalInfoIngestionQueue,
  planLegalInfoIngestionDryRun,
} from "../src/engine/knowledge";
import { createLegalArchiveStack } from "../src/infrastructure/archive";
import { getPrismaClient } from "../src/infrastructure/database/prisma-client";
import { PrismaKnowledgeRepository } from "../src/infrastructure/repositories/prisma-legal-knowledge-repository";
import { env } from "../src/lib/env";

const BATCH_SIZE = 10;
const BATCH_ID = "legalinfo-cloud-canary-10";

function redactDatabaseHost(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl);
    return parsed.host || "(unknown host)";
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function main() {
  console.log("This is a STAGING canary of 10 documents (Prisma + S3/R2).");
  console.log(
    "Use a staging DATABASE_URL and ARCHIVE_S3_PREFIX. Never use production credentials in tests.",
  );

  if (env.ARCHIVE_STORAGE !== "s3") {
    console.error(
      `ARCHIVE_STORAGE must be "s3" for this canary (got "${env.ARCHIVE_STORAGE}").`,
    );
    console.error(
      "Set ARCHIVE_STORAGE=s3 plus S3_BUCKET (or ARCHIVE_S3_BUCKET), S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.",
    );
    process.exit(1);
  }

  if (env.ARCHIVE_S3_PREFIX === "legal-archive") {
    console.warn(
      'ARCHIVE_S3_PREFIX is the default "legal-archive". Staging should use a separate prefix from production.',
    );
  }

  console.log(`DATABASE_URL host: ${redactDatabaseHost(env.DATABASE_URL)}`);
  console.log(`ARCHIVE_S3_PREFIX: ${env.ARCHIVE_S3_PREFIX}`);

  const root = process.cwd();
  const manifestPath = join(root, "tmp", "legalinfo-discovery-manifest.json");
  const reportPath = join(root, "tmp", "legalinfo-cloud-canary-10-report.json");

  const store = new FileLegalInfoManifestStore(manifestPath);
  const manifest = await store.load();
  if (!manifest) {
    console.error(`Manifest not found: ${manifestPath}`);
    process.exit(1);
  }

  const plan = planLegalInfoIngestionDryRun(manifest, {
    maxDocuments: BATCH_SIZE,
    includeStatuses: [LegalInfoDocumentStatus.PENDING],
  });
  const selectedLawIds = plan.items.map((item) => item.lawId);
  if (selectedLawIds.length === 0) {
    console.error("No PENDING documents available for the canary.");
    process.exit(1);
  }

  const stack = await createLegalArchiveStack({
    env,
    usePostgresMetadata: true,
  });
  if (stack.storageKind !== "s3" || stack.metadataKind !== "postgres") {
    console.error(
      `Unexpected stack: storage=${stack.storageKind} metadata=${stack.metadataKind}`,
    );
    process.exit(1);
  }

  const prisma = getPrismaClient();
  const knowledgeRepository = new PrismaKnowledgeRepository(
    stack.archive,
    prisma,
  );

  const health = await stack.archive.health();
  if (!health.ok) {
    console.error(`Archive storage health check failed: ${health.detail}`);
    process.exit(1);
  }

  console.log(`manifest: ${manifestPath}`);
  console.log(`report: ${reportPath}`);
  console.log(`storage: s3 (${health.detail})`);
  console.log(`metadata: postgres`);
  console.log(
    `selected PENDING lawIds (${selectedLawIds.length}): ${selectedLawIds.join(", ")}`,
  );
  console.log(
    `concurrency: ${LEGALINFO_INGESTION_CONCURRENCY}; requestDelayMs: ${LEGALINFO_INGESTION_DEFAULT_REQUEST_DELAY_MS}; timeoutMs: ${LEGALINFO_INGESTION_DEFAULT_TIMEOUT_MS}`,
  );

  const archivesBefore = await prisma.legalSourceArchive.count();
  const documentsBefore = await prisma.legalKnowledgeDocument.count();

  const startedAt = new Date();
  const startedMs = Date.now();

  const queue = new LegalInfoIngestionQueue({
    store,
    archive: stack.archive,
    knowledgeRepository,
    maxDocuments: selectedLawIds.length,
    onlyLawIds: selectedLawIds,
    retryFailed: true,
    requestDelayMs: LEGALINFO_INGESTION_DEFAULT_REQUEST_DELAY_MS,
    timeoutMs: LEGALINFO_INGESTION_DEFAULT_TIMEOUT_MS,
  });

  const result = await queue.run();
  const durationMs = Date.now() - startedMs;
  const completedAt = new Date();

  const selectedSet = new Set(selectedLawIds);
  const batchDocs = result.manifest.documents.filter((doc) =>
    selectedSet.has(doc.lawId),
  );

  let success = 0;
  let failed = 0;
  let skipped = 0;
  let articles = 0;
  let chunks = 0;
  let bytes = 0;

  const documents = batchDocs.map((doc) => {
    if (doc.status === LegalInfoDocumentStatus.SUCCESS) {
      success += 1;
      articles += doc.articleCount ?? 0;
      chunks += doc.chunkCount ?? 0;
      bytes += doc.byteSize ?? 0;
    } else if (doc.status === LegalInfoDocumentStatus.SKIPPED_DUPLICATE) {
      skipped += 1;
      articles += doc.articleCount ?? 0;
      chunks += doc.chunkCount ?? 0;
      bytes += doc.byteSize ?? 0;
    } else if (doc.status === LegalInfoDocumentStatus.FAILED) {
      failed += 1;
      if (!doc.failureReason) {
        console.error(`FAILED lawId=${doc.lawId} missing failureReason`);
      }
    } else {
      failed += 1;
      console.error(
        `Unexpected status for selected lawId=${doc.lawId}: ${doc.status}`,
      );
    }

    return {
      lawId: doc.lawId,
      officialUrl: doc.officialUrl,
      title: doc.title,
      status: doc.status,
      failureReason: doc.failureReason,
      sha256: doc.sha256,
      articleCount: doc.articleCount,
      chunkCount: doc.chunkCount,
      byteSize: doc.byteSize,
      attempts: doc.attempts,
      completedAt: doc.completedAt,
    };
  });

  // Idempotency check: re-process one SUCCESS document — no duplicate rows.
  let idempotency:
    | {
        lawId: string;
        sha256: string;
        archiveRowsBefore: number;
        archiveRowsAfter: number;
        knowledgeRowsBefore: number;
        knowledgeRowsAfter: number;
        ok: boolean;
      }
    | null = null;

  const sampleSuccess = batchDocs.find(
    (doc) =>
      doc.status === LegalInfoDocumentStatus.SUCCESS && doc.sha256 != null,
  );
  if (sampleSuccess?.sha256) {
    const archiveRowsBefore = await prisma.legalSourceArchive.count({
      where: { sha256: sampleSuccess.sha256 },
    });
    const knowledgeRowsBefore = await prisma.legalKnowledgeDocument.count({
      where: {
        sourceUrl: sampleSuccess.officialUrl,
        contentSha256: sampleSuccess.sha256,
      },
    });

    // Force a second durable save path via knowledge repository (archive dedupe).
    const existingKnowledge = await knowledgeRepository.findBySourceUrl(
      sampleSuccess.officialUrl,
    );
    if (existingKnowledge?.provenance) {
      await knowledgeRepository.save(existingKnowledge);
    }

    const archiveRowsAfter = await prisma.legalSourceArchive.count({
      where: { sha256: sampleSuccess.sha256 },
    });
    const knowledgeRowsAfter = await prisma.legalKnowledgeDocument.count({
      where: {
        sourceUrl: sampleSuccess.officialUrl,
        contentSha256: sampleSuccess.sha256,
      },
    });

    idempotency = {
      lawId: sampleSuccess.lawId,
      sha256: sampleSuccess.sha256,
      archiveRowsBefore,
      archiveRowsAfter,
      knowledgeRowsBefore,
      knowledgeRowsAfter,
      ok:
        archiveRowsBefore === archiveRowsAfter &&
        knowledgeRowsBefore === knowledgeRowsAfter &&
        archiveRowsAfter === 1 &&
        knowledgeRowsAfter === 1,
    };
  }

  const archivesAfter = await prisma.legalSourceArchive.count();
  const documentsAfter = await prisma.legalKnowledgeDocument.count();
  const s3ArchivesCreated = Math.max(0, archivesAfter - archivesBefore);
  const postgresDocumentsCreated = Math.max(
    0,
    documentsAfter - documentsBefore,
  );

  // Confirm each SUCCESS has archive blob + postgres rows.
  const verification = [];
  for (const doc of batchDocs) {
    if (doc.status !== LegalInfoDocumentStatus.SUCCESS || !doc.sha256) {
      continue;
    }
    const archiveRow = await prisma.legalSourceArchive.findUnique({
      where: { sha256: doc.sha256 },
    });
    const knowledgeRow = await prisma.legalKnowledgeDocument.findUnique({
      where: {
        sourceUrl_contentSha256: {
          sourceUrl: doc.officialUrl,
          contentSha256: doc.sha256,
        },
      },
      include: {
        _count: { select: { articles: true, chunks: true } },
      },
    });
    let blobOk = false;
    if (archiveRow) {
      blobOk = await stack.storage.has(archiveRow.storageKey);
    }
    verification.push({
      lawId: doc.lawId,
      archivePersisted: archiveRow != null,
      blobPresent: blobOk,
      knowledgePersisted: knowledgeRow != null,
      articleRows: knowledgeRow?._count.articles ?? 0,
      chunkRows: knowledgeRow?._count.chunks ?? 0,
    });
  }

  const report = {
    batch: BATCH_ID,
    live: true,
    cloud: true,
    archiveStorage: "s3",
    knowledgePersistence: "postgres",
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs,
    manifestPath,
    selectedLawIds,
    concurrency: LEGALINFO_INGESTION_CONCURRENCY,
    requestDelayMs: LEGALINFO_INGESTION_DEFAULT_REQUEST_DELAY_MS,
    timeoutMs: LEGALINFO_INGESTION_DEFAULT_TIMEOUT_MS,
    queue: {
      attempted: result.attempted,
      succeeded: result.succeeded,
      failed: result.failed,
      skippedSuccess: result.skippedSuccess,
      skippedDuplicate: result.skippedDuplicate,
    },
    checkpoint: result.manifest.checkpoint,
    idempotency,
    verification,
    totals: {
      total: selectedLawIds.length,
      success,
      failed,
      skipped,
      articles,
      chunks,
      bytes,
      s3Archives: s3ArchivesCreated,
      postgresDocuments: postgresDocumentsCreated,
      durationMs,
    },
    documents,
  };

  await mkdir(join(root, "tmp"), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("TOTAL", selectedLawIds.length);
  console.log("SUCCESS", success);
  console.log("FAILED", failed);
  console.log("SKIPPED", skipped);
  console.log("ARTICLES", articles);
  console.log("CHUNKS", chunks);
  console.log("BYTES", bytes);
  console.log("S3 ARCHIVES", s3ArchivesCreated);
  console.log("POSTGRES DOCUMENTS", postgresDocumentsCreated);
  console.log("DURATION", `${durationMs}ms`);
  if (idempotency) {
    console.log(
      `idempotency check (lawId=${idempotency.lawId}): ${idempotency.ok ? "OK" : "FAILED"}`,
    );
  }
  console.log(`report written: ${reportPath}`);
  console.log(
    "Note: remaining PENDING documents were NOT started automatically.",
  );
  console.log("Note: cloud archive objects were NOT deleted.");

  if (failed > 0 || (idempotency && !idempotency.ok)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
