/**
 * PRODUCTION full remaining-corpus LegalInfo cloud ingestion.
 *
 * Command role: production cloud ingest.
 * Do not run until the LegalInfo production foundation is verified.
 * Do not invoke from tests.
 *
 * Stack (same persistence as staging canary):
 *   HttpKnowledgeCrawler
 *   → ArchiveService (R2/S3)
 *   → Prisma archive metadata
 *   → LegalInfoKnowledgeParser → normalize/metadata/chunk
 *   → PrismaKnowledgeRepository
 *
 * Local parser test: `npm run ingest:legalinfo:batch-10`
 * Staging canary: `npm run ingest:legalinfo:canary-10`
 *
 * Resumes from tmp/legalinfo-discovery-manifest.json.
 * Does NOT start automatically on build/deploy — run explicitly.
 *
 * Usage:
 *   npm run ingest:legalinfo:cloud
 *   npm run ingest:legalinfo:cloud -- --dry-run
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
  plannedActionForStatus,
  selectQueue,
  type LegalInfoManifestDocument,
} from "../src/engine/knowledge";
import { createLegalArchiveStack } from "../src/infrastructure/archive";
import { getPrismaClient } from "../src/infrastructure/database/prisma-client";
import { PrismaKnowledgeRepository } from "../src/infrastructure/repositories/prisma-legal-knowledge-repository";
import { env } from "../src/lib/env";

const BATCH_ID = "legalinfo-cloud-full-corpus";

function parseArgs(argv: string[]): { dryRun: boolean } {
  return {
    dryRun: argv.includes("--dry-run") || argv.includes("-n"),
  };
}

function countByStatus(documents: readonly LegalInfoManifestDocument[]) {
  const counts = {
    PENDING: 0,
    RUNNING: 0,
    SUCCESS: 0,
    FAILED: 0,
    SKIPPED_DUPLICATE: 0,
  };
  for (const doc of documents) {
    counts[doc.status] += 1;
  }
  return counts;
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));

  if (env.ARCHIVE_STORAGE !== "s3") {
    console.error(
      `ARCHIVE_STORAGE must be "s3" for cloud ingestion (got "${env.ARCHIVE_STORAGE}").`,
    );
    console.error(
      "Set ARCHIVE_STORAGE=s3 plus S3_BUCKET (or ARCHIVE_S3_BUCKET), S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, and S3_ENDPOINT for R2.",
    );
    process.exit(1);
  }

  const root = process.cwd();
  const manifestPath = join(root, "tmp", "legalinfo-discovery-manifest.json");
  const reportPath = join(root, "tmp", "legalinfo-cloud-ingestion-report.json");

  const store = new FileLegalInfoManifestStore(manifestPath);
  const manifest = await store.load();
  if (!manifest) {
    console.error(`Manifest not found: ${manifestPath}`);
    console.error("Run npm run discover:legalinfo first.");
    process.exit(1);
  }

  const statusCountsBefore = countByStatus(manifest.documents);
  const selectedLawIds = selectQueue(manifest.documents, {
    retryFailed: true,
  });

  console.log(
    dryRun
      ? "LegalInfo cloud ingestion DRY-RUN (full remaining corpus)"
      : "This is a LIVE full-corpus LegalInfo cloud ingestion.",
  );
  console.log(`manifest: ${manifestPath}`);
  console.log(`report: ${reportPath}`);
  console.log(`documents in manifest: ${manifest.documents.length}`);
  console.log(`status before: ${JSON.stringify(statusCountsBefore)}`);
  console.log(`selected for this run: ${selectedLawIds.length}`);
  console.log(
    `concurrency: ${LEGALINFO_INGESTION_CONCURRENCY}; requestDelayMs: ${LEGALINFO_INGESTION_DEFAULT_REQUEST_DELAY_MS}; timeoutMs: ${LEGALINFO_INGESTION_DEFAULT_TIMEOUT_MS}`,
  );
  console.log("Resume rules:");
  console.log(
    `  SUCCESS → ${plannedActionForStatus(LegalInfoDocumentStatus.SUCCESS)}`,
  );
  console.log(
    `  SKIPPED_DUPLICATE → ${plannedActionForStatus(LegalInfoDocumentStatus.SKIPPED_DUPLICATE)}`,
  );
  console.log(
    `  FAILED → ${plannedActionForStatus(LegalInfoDocumentStatus.FAILED, { retryFailed: true })}`,
  );
  console.log(
    `  RUNNING → ${plannedActionForStatus(LegalInfoDocumentStatus.RUNNING)}`,
  );
  console.log(
    `  PENDING → ${plannedActionForStatus(LegalInfoDocumentStatus.PENDING)}`,
  );

  if (selectedLawIds.length === 0) {
    console.log("Nothing to process — corpus has no PENDING/FAILED/RUNNING documents.");
    const emptyReport = {
      batch: BATCH_ID,
      dryRun,
      live: !dryRun,
      cloud: true,
      archiveStorage: "s3",
      knowledgePersistence: "postgres",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
      manifestPath,
      selectedLawIds: [],
      statusCountsBefore,
      totals: {
        totalSelected: 0,
        success: 0,
        failed: 0,
        skipped: 0,
        duplicate: 0,
        articles: 0,
        chunks: 0,
        bytes: 0,
        durationMs: 0,
        remainingPending: statusCountsBefore.PENDING,
      },
      failures: [],
      firstLawId: null,
      lastLawId: null,
      idempotency: null,
      note: "No eligible documents; SUCCESS documents were not reset.",
    };
    await mkdir(join(root, "tmp"), { recursive: true });
    await writeFile(
      reportPath,
      `${JSON.stringify(emptyReport, null, 2)}\n`,
      "utf8",
    );
    console.log(`report written: ${reportPath}`);
    return;
  }

  console.log(
    `first/last selected lawId: ${selectedLawIds[0]} … ${selectedLawIds[selectedLawIds.length - 1]}`,
  );

  if (dryRun) {
    const planned = selectedLawIds.map((lawId) => {
      const doc = manifest.documents.find((d) => d.lawId === lawId)!;
      return {
        lawId: doc.lawId,
        officialUrl: doc.officialUrl,
        status: doc.status,
        plannedAction: plannedActionForStatus(doc.status, {
          retryFailed: true,
        }),
      };
    });

    const report = {
      batch: BATCH_ID,
      dryRun: true,
      live: false,
      cloud: true,
      archiveStorage: "s3",
      knowledgePersistence: "postgres",
      httpRequests: false,
      manifestMutations: false,
      r2Writes: false,
      postgresWrites: false,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
      manifestPath,
      selectedLawIds,
      statusCountsBefore,
      concurrency: LEGALINFO_INGESTION_CONCURRENCY,
      requestDelayMs: LEGALINFO_INGESTION_DEFAULT_REQUEST_DELAY_MS,
      timeoutMs: LEGALINFO_INGESTION_DEFAULT_TIMEOUT_MS,
      planned,
      totals: {
        totalSelected: selectedLawIds.length,
        success: 0,
        failed: 0,
        skipped: 0,
        duplicate: 0,
        articles: 0,
        chunks: 0,
        bytes: 0,
        durationMs: 0,
        remainingPending: statusCountsBefore.PENDING,
      },
      failures: [],
      firstLawId: selectedLawIds[0] ?? null,
      lastLawId: selectedLawIds[selectedLawIds.length - 1] ?? null,
      idempotency: null,
      note: "DRY-RUN only — no HTTP, R2, PostgreSQL, or manifest mutations.",
    };

    // Reload to prove dry-run did not mutate the manifest.
    const reloaded = await store.load();
    const unchanged =
      reloaded != null &&
      reloaded.documents.every((doc, i) => {
        const before = manifest.documents[i];
        return (
          before != null &&
          before.lawId === doc.lawId &&
          before.status === doc.status
        );
      });

    await mkdir(join(root, "tmp"), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    console.log("TOTAL SELECTED", selectedLawIds.length);
    console.log("SUCCESS", 0);
    console.log("FAILED", 0);
    console.log("SKIPPED", 0);
    console.log("DUPLICATE", 0);
    console.log("ARTICLES", 0);
    console.log("CHUNKS", 0);
    console.log("BYTES", 0);
    console.log("DURATION", "0ms");
    console.log(`manifest statuses unchanged: ${unchanged}`);
    console.log(`report written: ${reportPath}`);
    console.log("DRY-RUN complete — no crawl performed.");
    if (!unchanged) {
      process.exitCode = 1;
    }
    return;
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

  console.log(`storage: s3 (${health.detail})`);
  console.log("metadata: postgres");
  console.log(
    "Note: SUCCESS/SKIPPED_DUPLICATE documents will not be re-downloaded.",
  );

  const startedAt = new Date();
  const startedMs = Date.now();

  const queue = new LegalInfoIngestionQueue({
    store,
    archive: stack.archive,
    knowledgeRepository,
    onlyLawIds: selectedLawIds,
    maxDocuments: selectedLawIds.length,
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
  const statusCountsAfter = countByStatus(result.manifest.documents);

  let success = 0;
  let failed = 0;
  let skipped = 0;
  let duplicate = 0;
  let articles = 0;
  let chunks = 0;
  let bytes = 0;
  const failures: Array<{ lawId: string; error: string }> = [];

  for (const doc of batchDocs) {
    if (doc.status === LegalInfoDocumentStatus.SUCCESS) {
      success += 1;
      articles += doc.articleCount ?? 0;
      chunks += doc.chunkCount ?? 0;
      bytes += doc.byteSize ?? 0;
    } else if (doc.status === LegalInfoDocumentStatus.SKIPPED_DUPLICATE) {
      duplicate += 1;
      skipped += 1;
      articles += doc.articleCount ?? 0;
      chunks += doc.chunkCount ?? 0;
      bytes += doc.byteSize ?? 0;
    } else if (doc.status === LegalInfoDocumentStatus.FAILED) {
      failed += 1;
      failures.push({
        lawId: doc.lawId,
        error: doc.failureReason ?? "unknown failure (no failureReason)",
      });
    } else {
      failed += 1;
      failures.push({
        lawId: doc.lawId,
        error: `unexpected terminal status: ${doc.status}`,
      });
    }
  }

  // Idempotency: re-save one SUCCESS knowledge row — no duplicate DB rows.
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

  const report = {
    batch: BATCH_ID,
    dryRun: false,
    live: true,
    cloud: true,
    archiveStorage: "s3",
    knowledgePersistence: "postgres",
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs,
    manifestPath,
    selectedLawIds,
    statusCountsBefore,
    statusCountsAfter,
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
    firstLawId: selectedLawIds[0] ?? null,
    lastLawId: selectedLawIds[selectedLawIds.length - 1] ?? null,
    failures,
    idempotency,
    totals: {
      totalSelected: selectedLawIds.length,
      success,
      failed,
      skipped,
      duplicate,
      articles,
      chunks,
      bytes,
      durationMs,
      remainingPending: statusCountsAfter.PENDING,
    },
    note: "R2 archive objects were not deleted. SUCCESS documents were not reset to PENDING.",
  };

  await mkdir(join(root, "tmp"), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("TOTAL SELECTED", selectedLawIds.length);
  console.log("SUCCESS", success);
  console.log("FAILED", failed);
  console.log("SKIPPED", skipped);
  console.log("DUPLICATE", duplicate);
  console.log("ARTICLES", articles);
  console.log("CHUNKS", chunks);
  console.log("BYTES", bytes);
  console.log("DURATION", `${durationMs}ms`);
  console.log("REMAINING PENDING", statusCountsAfter.PENDING);
  console.log(
    `first/last lawId: ${selectedLawIds[0]} … ${selectedLawIds[selectedLawIds.length - 1]}`,
  );
  if (idempotency) {
    console.log(
      `idempotency check (lawId=${idempotency.lawId}): ${idempotency.ok ? "OK" : "FAILED"}`,
    );
  }
  if (failures.length > 0) {
    console.log(`failures (${failures.length}):`);
    for (const item of failures.slice(0, 20)) {
      console.log(`  lawId=${item.lawId}: ${item.error}`);
    }
    if (failures.length > 20) {
      console.log(`  … and ${failures.length - 20} more (see report)`);
    }
  }
  console.log(`report written: ${reportPath}`);
  console.log("Note: cloud archive objects were NOT deleted.");

  if (failed > 0 || (idempotency && !idempotency.ok)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
