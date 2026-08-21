/**
 * SAFE dry-run for the LegalInfo resumable ingestion queue.
 *
 * - Reads tmp/legalinfo-discovery-manifest.json
 * - Selects the first 10 PENDING documents
 * - Prints planned actions only
 * - Does NOT make HTTP requests
 * - Does NOT mutate the manifest
 *
 * Usage:
 *   npx tsx scripts/ingest-legalinfo-dry-run.ts
 *   npm run ingest:legalinfo:dry-run
 */

import { join } from "node:path";

import {
  FileLegalInfoManifestStore,
  LEGALINFO_INGESTION_CONCURRENCY,
  LegalInfoDocumentStatus,
  planLegalInfoIngestionDryRun,
  plannedActionForStatus,
  selectQueue,
} from "../src/engine/knowledge";

async function main() {
  const manifestPath = join(
    process.cwd(),
    "tmp",
    "legalinfo-discovery-manifest.json",
  );
  const store = new FileLegalInfoManifestStore(manifestPath);
  const manifest = await store.load();
  if (!manifest) {
    console.error(`Manifest not found: ${manifestPath}`);
    console.error("Run npm run discover:legalinfo first.");
    process.exit(1);
  }

  const beforeStatuses = Object.freeze(
    manifest.documents.map((d) => ({ lawId: d.lawId, status: d.status })),
  );

  const plan = planLegalInfoIngestionDryRun(manifest, {
    maxDocuments: 10,
    includeStatuses: [LegalInfoDocumentStatus.PENDING],
    retryFailed: true,
  });

  console.log("LegalInfo ingestion DRY-RUN");
  console.log("===========================");
  console.log(`manifest: ${manifestPath}`);
  console.log(`documents in manifest: ${manifest.documents.length}`);
  console.log(`selected PENDING (max 10): ${plan.items.length}`);
  console.log(`httpRequests: ${plan.httpRequests}`);
  console.log(`manifestMutations: ${plan.manifestMutations}`);
  console.log(`checkpointWired: ${plan.checkpointWired}`);
  console.log(
    `concurrency: ${plan.concurrency} (sequential HttpKnowledgeCrawler; LEGALINFO_INGESTION_CONCURRENCY=${LEGALINFO_INGESTION_CONCURRENCY})`,
  );
  console.log(`requestDelayMs: ${plan.requestDelayMs}`);
  console.log(`timeoutMs: ${plan.timeoutMs}`);
  console.log(
    `checkpoint.lastProcessedLawId: ${manifest.checkpoint.lastProcessedLawId ?? "(none)"}`,
  );
  console.log("");
  console.log("Resume selection rules (verified):");
  console.log(
    `  SUCCESS → ${plannedActionForStatus(LegalInfoDocumentStatus.SUCCESS)}`,
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
  console.log(
    `  SKIPPED_DUPLICATE → ${plannedActionForStatus(LegalInfoDocumentStatus.SKIPPED_DUPLICATE)}`,
  );
  console.log(
    `selectQueue sample (retryFailed=true, max=10): ${selectQueue(manifest.documents, { retryFailed: true, maxDocuments: 10 }).join(", ")}`,
  );
  console.log("");

  for (const item of plan.items) {
    console.log("----------------------");
    console.log(`lawId: ${item.lawId}`);
    console.log(`official URL: ${item.officialUrl}`);
    console.log(`current status: ${item.status}`);
    console.log(`planned action: ${item.plannedAction}`);
  }

  // Guarantees: dry-run did not mutate in-memory snapshot or on-disk statuses.
  const reloaded = await store.load();
  const afterStatuses = reloaded!.documents.map((d) => ({
    lawId: d.lawId,
    status: d.status,
  }));
  const unchanged =
    beforeStatuses.length === afterStatuses.length &&
    beforeStatuses.every(
      (row, i) =>
        row.lawId === afterStatuses[i]?.lawId &&
        row.status === afterStatuses[i]?.status,
    );

  console.log("===========================");
  console.log(`manifest statuses unchanged: ${unchanged}`);
  console.log("DRY-RUN complete — no crawl performed.");

  if (!unchanged) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
