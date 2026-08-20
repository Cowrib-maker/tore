/**
 * LIVE LegalInfo bulk ingestion — first 10 PENDING documents only.
 *
 * Uses the validated resumable queue + HttpKnowledgeCrawler + ArchiveService
 * + LegalInfoKnowledgeParser pipeline. Does NOT start the remaining corpus.
 *
 * Usage:
 *   npm run ingest:legalinfo:batch-10
 */

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
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

const BATCH_SIZE = 10;
const BATCH_ID = "legalinfo-first-10-pending";

type BatchReport = {
  batch: string;
  selectedLawIds: string[];
  totals?: { success: number; failed: number; skipped: number };
};

async function resolveSelectedLawIds(
  manifestPath: string,
  reportPath: string,
  documents: { lawId: string; status: string }[],
): Promise<{ lawIds: string[]; alreadyComplete: boolean }> {
  // Resume / honor the same bounded batch if a prior report exists.
  try {
    const raw = await readFile(reportPath, "utf8");
    const prior = JSON.parse(raw) as BatchReport;
    if (
      prior.batch === BATCH_ID &&
      Array.isArray(prior.selectedLawIds) &&
      prior.selectedLawIds.length > 0
    ) {
      const unfinished = prior.selectedLawIds.filter((lawId) => {
        const doc = documents.find((d) => d.lawId === lawId);
        return (
          doc != null &&
          doc.status !== LegalInfoDocumentStatus.SUCCESS &&
          doc.status !== LegalInfoDocumentStatus.SKIPPED_DUPLICATE
        );
      });
      if (unfinished.length === 0) {
        return { lawIds: prior.selectedLawIds, alreadyComplete: true };
      }
      console.log(
        `Resuming incomplete batch (${unfinished.length} remaining of ${prior.selectedLawIds.length}).`,
      );
      return { lawIds: prior.selectedLawIds, alreadyComplete: false };
    }
  } catch {
    // no prior report
  }

  // Interrupted mid-run before a report existed: reconstruct the original
  // first-N window (leading SUCCESS/SKIPPED + open PENDING/RUNNING/FAILED).
  const reconstructed: string[] = [];
  for (const doc of documents) {
    if (reconstructed.length >= BATCH_SIZE) {
      break;
    }
    if (
      doc.status === LegalInfoDocumentStatus.SUCCESS ||
      doc.status === LegalInfoDocumentStatus.SKIPPED_DUPLICATE ||
      doc.status === LegalInfoDocumentStatus.PENDING ||
      doc.status === LegalInfoDocumentStatus.RUNNING ||
      doc.status === LegalInfoDocumentStatus.FAILED
    ) {
      reconstructed.push(doc.lawId);
    }
  }

  const openInWindow = reconstructed.filter((lawId) => {
    const doc = documents.find((d) => d.lawId === lawId);
    return (
      doc?.status === LegalInfoDocumentStatus.PENDING ||
      doc?.status === LegalInfoDocumentStatus.RUNNING ||
      doc?.status === LegalInfoDocumentStatus.FAILED
    );
  });
  const completedInWindow = reconstructed.length - openInWindow.length;

  if (completedInWindow > 0 && openInWindow.length > 0) {
    console.log(
      `Resuming interrupted first-${BATCH_SIZE} window (${openInWindow.length} remaining).`,
    );
    return { lawIds: reconstructed.slice(0, BATCH_SIZE), alreadyComplete: false };
  }

  if (
    reconstructed.length === BATCH_SIZE &&
    openInWindow.length === 0 &&
    completedInWindow === BATCH_SIZE
  ) {
    return { lawIds: reconstructed, alreadyComplete: true };
  }

  const store = new FileLegalInfoManifestStore(manifestPath);
  const manifest = await store.load();
  if (!manifest) {
    return { lawIds: [], alreadyComplete: false };
  }
  const plan = planLegalInfoIngestionDryRun(manifest, {
    maxDocuments: BATCH_SIZE,
    includeStatuses: [LegalInfoDocumentStatus.PENDING],
  });
  return {
    lawIds: plan.items.map((item) => item.lawId),
    alreadyComplete: false,
  };
}

async function main() {
  console.log("This is a LIVE ingestion of 10 documents.");

  const root = process.cwd();
  const manifestPath = join(root, "tmp", "legalinfo-discovery-manifest.json");
  const archiveRootDir = join(root, "tmp", "legalinfo-archive");
  const reportPath = join(root, "tmp", "legalinfo-batch-10-report.json");

  // Clean orphaned Windows rename temps from a prior EPERM.
  try {
    const { readdir } = await import("node:fs/promises");
    for (const name of await readdir(join(root, "tmp"))) {
      if (
        name.startsWith("legalinfo-discovery-manifest.json.") &&
        (name.endsWith(".tmp") || name.endsWith(".bak"))
      ) {
        await unlink(join(root, "tmp", name)).catch(() => undefined);
      }
    }
  } catch {
    // ignore
  }

  const store = new FileLegalInfoManifestStore(manifestPath);
  const manifest = await store.load();
  if (!manifest) {
    console.error(`Manifest not found: ${manifestPath}`);
    console.error("Run npm run discover:legalinfo first.");
    process.exit(1);
  }

  const resolved = await resolveSelectedLawIds(
    manifestPath,
    reportPath,
    manifest.documents,
  );
  const selectedLawIds = resolved.lawIds;

  if (selectedLawIds.length === 0) {
    console.error("No PENDING documents available to ingest.");
    process.exit(1);
  }

  if (resolved.alreadyComplete) {
    const docs = manifest.documents.filter((d) =>
      selectedLawIds.includes(d.lawId),
    );
    const success = docs.filter(
      (d) => d.status === LegalInfoDocumentStatus.SUCCESS,
    ).length;
    const skipped = docs.filter(
      (d) => d.status === LegalInfoDocumentStatus.SKIPPED_DUPLICATE,
    ).length;
    const articles = docs.reduce((n, d) => n + (d.articleCount ?? 0), 0);
    const chunks = docs.reduce((n, d) => n + (d.chunkCount ?? 0), 0);
    const bytes = docs.reduce((n, d) => n + (d.byteSize ?? 0), 0);
    console.log("Batch already complete — not starting additional documents.");
    console.log("TOTAL", selectedLawIds.length);
    console.log("SUCCESS", success);
    console.log("FAILED", 0);
    console.log("SKIPPED", skipped);
    console.log("ARTICLES", articles);
    console.log("CHUNKS", chunks);
    console.log("BYTES", bytes);
    console.log("DURATION", "0ms");
    return;
  }

  if (selectedLawIds.length < BATCH_SIZE) {
    console.warn(
      `Only ${selectedLawIds.length} documents in this batch window (requested ${BATCH_SIZE}).`,
    );
  }

  const selectedSet = new Set(selectedLawIds);

  console.log(`manifest: ${manifestPath}`);
  console.log(`archive: ${archiveRootDir}`);
  console.log(`report: ${reportPath}`);
  console.log(
    `selected lawIds (${selectedLawIds.length}): ${selectedLawIds.join(", ")}`,
  );
  console.log(
    `concurrency: ${LEGALINFO_INGESTION_CONCURRENCY}; requestDelayMs: ${LEGALINFO_INGESTION_DEFAULT_REQUEST_DELAY_MS}; timeoutMs: ${LEGALINFO_INGESTION_DEFAULT_TIMEOUT_MS}`,
  );

  await mkdir(archiveRootDir, { recursive: true });

  // Write a preflight report so a crash mid-run can resume the same lawIds.
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        batch: BATCH_ID,
        live: true,
        status: "RUNNING",
        selectedLawIds,
        manifestPath,
        archiveRootDir,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const startedAt = new Date();
  const startedMs = Date.now();

  const queue = new LegalInfoIngestionQueue({
    store,
    archiveRootDir,
    maxDocuments: selectedLawIds.length,
    onlyLawIds: selectedLawIds,
    retryFailed: true,
    requestDelayMs: LEGALINFO_INGESTION_DEFAULT_REQUEST_DELAY_MS,
    timeoutMs: LEGALINFO_INGESTION_DEFAULT_TIMEOUT_MS,
  });

  const result = await queue.run();
  const completedAt = new Date();
  const durationMs = Date.now() - startedMs;

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
        console.error(
          `FAILED lawId=${doc.lawId} has no failureReason (must not silently skip)`,
        );
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
      duplicateOfLawId: doc.duplicateOfLawId,
      articleCount: doc.articleCount,
      chunkCount: doc.chunkCount,
      byteSize: doc.byteSize,
      attempts: doc.attempts,
      lastAttemptAt: doc.lastAttemptAt,
      completedAt: doc.completedAt,
    };
  });

  const total = selectedLawIds.length;
  const report = {
    batch: BATCH_ID,
    live: true,
    status: failed > 0 ? "COMPLETED_WITH_FAILURES" : "COMPLETED",
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs,
    manifestPath,
    archiveRootDir,
    concurrency: LEGALINFO_INGESTION_CONCURRENCY,
    requestDelayMs: LEGALINFO_INGESTION_DEFAULT_REQUEST_DELAY_MS,
    timeoutMs: LEGALINFO_INGESTION_DEFAULT_TIMEOUT_MS,
    selectedLawIds,
    queue: {
      attempted: result.attempted,
      succeeded: result.succeeded,
      failed: result.failed,
      skippedSuccess: result.skippedSuccess,
      skippedDuplicate: result.skippedDuplicate,
    },
    checkpoint: result.manifest.checkpoint,
    totals: {
      total,
      success,
      failed,
      skipped,
      articles,
      chunks,
      bytes,
      durationMs,
    },
    documents,
  };

  await mkdir(join(root, "tmp"), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("TOTAL", total);
  console.log("SUCCESS", success);
  console.log("FAILED", failed);
  console.log("SKIPPED", skipped);
  console.log("ARTICLES", articles);
  console.log("CHUNKS", chunks);
  console.log("BYTES", bytes);
  console.log("DURATION", `${durationMs}ms`);
  console.log(`report written: ${reportPath}`);
  console.log(
    "Note: remaining PENDING documents were NOT started automatically.",
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
