/**
 * LOCAL / STAGING LegalInfo ingest → Prisma + local filesystem archive.
 *
 * Command role: local/staging corpus bootstrap (plan 1B).
 * Persistence:
 *   Prisma archive metadata
 *   PrismaKnowledgeRepository
 *   Local archive bytes (ARCHIVE_STORAGE=local, default .data/legal-archive)
 *
 * Does NOT require S3. Does NOT start the full remaining corpus.
 * Production remaining-corpus: `npm run ingest:legalinfo:cloud` (after smoke).
 *
 * Runbook:
 *   1. npm run discover:legalinfo
 *   2. npm run identify:legalinfo:priority
 *   3. npm run ingest:legalinfo:local-prisma -- --from-priority
 *      or: npm run ingest:legalinfo:local-prisma -- --law-ids 367,59
 *
 * Usage:
 *   npm run ingest:legalinfo:local-prisma -- --from-priority
 *   npm run ingest:legalinfo:local-prisma -- --law-ids <id,id,...>
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
  identifyPriorityLawsFromDocuments,
  priorityLawIdsForIngest,
} from "../src/engine/knowledge";
import { createLegalArchiveStack } from "../src/infrastructure/archive";
import { getPrismaClient } from "../src/infrastructure/database/prisma-client";
import { PrismaKnowledgeRepository } from "../src/infrastructure/repositories/prisma-legal-knowledge-repository";
import { env } from "../src/lib/env";

const BATCH_ID = "legalinfo-local-prisma-priority";

type Args = {
  fromPriority: boolean;
  lawIds: string[];
  maxDocuments: number | null;
  retryFailed: boolean;
};

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const lawIdsRaw = get("--law-ids");
  const maxRaw = get("--max");
  return {
    fromPriority: argv.includes("--from-priority"),
    lawIds: lawIdsRaw
      ? lawIdsRaw
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      : [],
    maxDocuments: maxRaw ? Math.max(1, Number(maxRaw)) : null,
    retryFailed: !argv.includes("--no-retry-failed"),
  };
}

function redactDatabaseHost(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl);
    return parsed.host || "(unknown host)";
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log("LegalInfo LOCAL Prisma ingest (archive = local filesystem).");
  console.log(
    "Use a local/staging DATABASE_URL. Do not point at production unless intentional.",
  );

  // This command always uses local blob storage, even if .env has ARCHIVE_STORAGE=s3
  // (S3 is for canary-10 / cloud ingest).
  const localEnv = {
    ...env,
    ARCHIVE_STORAGE: "local" as const,
  };

  const root = process.cwd();
  const manifestPath = join(root, "tmp", "legalinfo-discovery-manifest.json");
  const reportPath = join(root, "tmp", "legalinfo-local-prisma-report.json");

  const store = new FileLegalInfoManifestStore(manifestPath);
  const manifest = await store.load();
  if (!manifest) {
    console.error(`Manifest not found: ${manifestPath}`);
    console.error("Run npm run discover:legalinfo first.");
    process.exit(1);
  }

  let selectedLawIds: string[] = [];
  let priorityReport: ReturnType<typeof identifyPriorityLawsFromDocuments> | null =
    null;

  if (args.fromPriority) {
    priorityReport = identifyPriorityLawsFromDocuments(manifest.documents);
    selectedLawIds = priorityLawIdsForIngest(priorityReport);
    if (priorityReport.ambiguous.length > 0) {
      console.warn(
        `Ambiguous priority keys (skipped): ${priorityReport.ambiguous.join(", ")}`,
      );
    }
    if (priorityReport.missing.length > 0) {
      console.warn(
        `Missing priority keys: ${priorityReport.missing.join(", ")}`,
      );
    }
  } else if (args.lawIds.length > 0) {
    selectedLawIds = args.lawIds;
  } else {
    console.error("Pass --from-priority or --law-ids <id,id,...>");
    process.exit(1);
  }

  if (args.maxDocuments != null) {
    selectedLawIds = selectedLawIds.slice(0, args.maxDocuments);
  }

  if (selectedLawIds.length === 0) {
    console.error("No lawIds selected for ingest.");
    process.exit(1);
  }

  console.log(`DATABASE_URL host: ${redactDatabaseHost(env.DATABASE_URL)}`);
  console.log(
    `ARCHIVE_LOCAL_ROOT: ${localEnv.ARCHIVE_LOCAL_ROOT || ".data/legal-archive"}`,
  );
  if (env.ARCHIVE_STORAGE === "s3") {
    console.warn(
      'Note: .env ARCHIVE_STORAGE=s3 ignored for this command — using local archive.',
    );
  }

  const stack = await createLegalArchiveStack({
    env: localEnv,
    usePostgresMetadata: true,
  });
  if (stack.storageKind !== "local" || stack.metadataKind !== "postgres") {
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
  console.log(`storage: local (${health.detail})`);
  console.log(`metadata: postgres`);
  console.log(
    `selected lawIds (${selectedLawIds.length}): ${selectedLawIds.join(", ")}`,
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
    retryFailed: args.retryFailed,
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
    } else if (doc.status === LegalInfoDocumentStatus.FAILED) {
      failed += 1;
    } else if (
      doc.status === LegalInfoDocumentStatus.PENDING ||
      doc.status === LegalInfoDocumentStatus.RUNNING
    ) {
      // Not attempted this run (already SUCCESS earlier, or filtered).
    } else {
      failed += 1;
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
    };
  });

  const archivesAfter = await prisma.legalSourceArchive.count();
  const documentsAfter = await prisma.legalKnowledgeDocument.count();

  const report = {
    batch: BATCH_ID,
    live: true,
    cloud: false,
    archiveStorage: "local",
    knowledgePersistence: "postgres",
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs,
    manifestPath,
    selectedLawIds,
    priority: priorityReport
      ? {
          missing: priorityReport.missing,
          ambiguous: priorityReport.ambiguous,
          unambiguousCount: priorityReport.unambiguous.length,
        }
      : null,
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
    totals: {
      total: selectedLawIds.length,
      success,
      failed,
      skipped,
      articles,
      chunks,
      bytes,
      localArchivesCreated: Math.max(0, archivesAfter - archivesBefore),
      postgresDocumentsCreated: Math.max(0, documentsAfter - documentsBefore),
      durationMs,
    },
    documents,
  };

  await mkdir(join(root, "tmp"), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("SUCCESS", success);
  console.log("FAILED", failed);
  console.log("SKIPPED", skipped);
  console.log("ARTICLES", articles);
  console.log("CHUNKS", chunks);
  console.log("DURATION", `${durationMs}ms`);
  console.log(`report written: ${reportPath}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
