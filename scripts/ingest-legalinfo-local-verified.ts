/**
 * VERIFIED-LOCAL LegalInfo ingest → Prisma (tore_verification) + local
 * filesystem archive.
 *
 * This is a safety-corrected driver around the EXISTING ingestion engine
 * (LegalInfoIngestionQueue, PrismaKnowledgeRepository, createLegalArchiveStack,
 * FileLegalInfoManifestStore) — none of that logic is reimplemented here.
 *
 * Why this script exists instead of `npm run ingest:legalinfo:local-prisma`:
 * that script's `import "dotenv/config"` + `@/lib/env` resolve DATABASE_URL
 * from `.env`, not `.env.local` — and in this repo `.env` holds the
 * production Neon URL (confirmed by this repo's own `prisma db execute`
 * safety guard throughout this project's history). A prior local-prisma
 * run's report (tmp/legalinfo-local-prisma-report.json, 2026-08-31) shows
 * postgresDocumentsCreated: 0 despite "success: 10" — because it was
 * silently reading/writing against whatever `.env` pointed to that day,
 * not the local verification database. This script fixes only that one
 * bootstrap problem, using the same .env.local-verification pattern
 * already established in scripts/populate-legal-knowledge-graph.ts.
 *
 * The shared discovery manifest (tmp/legalinfo-discovery-manifest.json)
 * tracks ingestion status GLOBALLY (943/947 already SUCCESS from that
 * earlier cloud run), not per-target-database — so selectQueue() would
 * skip already-SUCCESS lawIds even though tore_verification has none of
 * that data. For lawIds explicitly selected via --law-ids that are
 * currently marked SUCCESS, this script resets them to PENDING in the
 * manifest FIRST (a local JSON file edit, not a database mutation) so a
 * genuine local re-fetch actually happens; a successful run sets them
 * back to SUCCESS afterward, same as any other ingestion run would.
 *
 * Usage:
 *   npm run ingest:legalinfo:local-verified -- --law-ids 367,299,11634
 *   npm run ingest:legalinfo:local-verified -- --law-ids 367 --dry-run
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { classifyDatabaseUrl } from "./lib/database-url-safety";

type Args = {
  lawIds: string[];
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const idx = argv.indexOf("--law-ids");
  const raw = idx >= 0 ? argv[idx + 1] : undefined;
  const lawIds = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  return { lawIds, dryRun: argv.includes("--dry-run") };
}

function redactDatabaseHost(databaseUrl: string): string {
  try {
    return new URL(databaseUrl).host || "(unknown host)";
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

function loadEnvLocalDatabaseUrl(): string {
  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  const content = readFileSync(envLocalPath, "utf8");
  const match = content.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/m);
  if (!match) {
    throw new Error("[ingest:legalinfo:local-verified] DATABASE_URL not found in .env.local.");
  }
  return match[1].trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.lawIds.length === 0) {
    console.error("Pass --law-ids <id,id,...>");
    process.exit(1);
  }

  const databaseUrl = loadEnvLocalDatabaseUrl();
  const classification = classifyDatabaseUrl(databaseUrl);
  if (classification.kind !== "local") {
    console.error(
      `Refusing: .env.local DATABASE_URL is not local (${classification.kind}).`,
    );
    process.exit(1);
  }

  // Set before ANY dynamic import below touches @/lib/env — see this
  // script's header comment. NODE_ENV=test lets AUTH_SECRET default.
  process.env.DATABASE_URL = databaseUrl;
  process.env.ARCHIVE_STORAGE = "local";
  (process.env as { NODE_ENV?: string }).NODE_ENV ??= "test";

  const { env } = await import("../src/lib/env");
  const {
    FileLegalInfoManifestStore,
    LEGALINFO_INGESTION_DEFAULT_REQUEST_DELAY_MS,
    LEGALINFO_INGESTION_DEFAULT_TIMEOUT_MS,
    LegalInfoDocumentStatus,
    LegalInfoIngestionQueue,
    planLegalInfoIngestionDryRun,
  } = await import("../src/engine/knowledge");
  const { createLegalArchiveStack } = await import("../src/infrastructure/archive");
  const { getPrismaClient } = await import("../src/infrastructure/database/prisma-client");
  const { PrismaKnowledgeRepository } = await import(
    "../src/infrastructure/repositories/prisma-legal-knowledge-repository"
  );

  console.log(`[ingest:legalinfo:local-verified] DATABASE_URL host: ${redactDatabaseHost(env.DATABASE_URL)}`);
  if (classification.kind !== "local") {
    // Defense in depth: re-check after the env module resolved its own copy.
    console.error("Refusing: resolved DATABASE_URL is not local after env load.");
    process.exit(1);
  }

  const root = process.cwd();
  const manifestPath = path.join(root, "tmp", "legalinfo-discovery-manifest.json");
  const store = new FileLegalInfoManifestStore(manifestPath);
  const manifest = await store.load();
  if (!manifest) {
    console.error(`Manifest not found: ${manifestPath}. Run npm run discover:legalinfo first.`);
    process.exit(1);
  }

  const requestedSet = new Set(args.lawIds);
  const found = manifest.documents.filter((d) => requestedSet.has(d.lawId));
  const missing = args.lawIds.filter((id) => !found.some((d) => d.lawId === id));
  if (missing.length > 0) {
    console.error(`lawIds not present in manifest (run discovery?): ${missing.join(", ")}`);
  }
  if (found.length === 0) {
    console.error("None of the requested lawIds exist in the manifest.");
    process.exit(1);
  }

  const alreadySuccess = found.filter((d) => d.status === LegalInfoDocumentStatus.SUCCESS);
  console.log(
    `[ingest:legalinfo:local-verified] requested ${args.lawIds.length}, found ${found.length} in manifest, ` +
      `${alreadySuccess.length} currently marked SUCCESS (globally — not necessarily present in THIS database).`,
  );

  if (args.dryRun) {
    const plan = planLegalInfoIngestionDryRun(manifest, {
      maxDocuments: found.length,
      includeStatuses: [
        LegalInfoDocumentStatus.PENDING,
        LegalInfoDocumentStatus.FAILED,
        LegalInfoDocumentStatus.SUCCESS,
      ],
      retryFailed: true,
    });
    const relevant = plan.items.filter((item) => requestedSet.has(item.lawId));
    console.log("DRY RUN — no HTTP requests, no manifest writes, no database writes.");
    console.log(JSON.stringify({ ...plan, items: relevant }, null, 2));
    console.log(
      `Note: ${alreadySuccess.length} requested lawId(s) are marked SUCCESS in the manifest; a real (non-dry-run) ` +
        "invocation of this script will reset exactly those to PENDING first so they are genuinely re-fetched " +
        "for THIS local database, then run the same resumable queue used by every other ingestion command.",
    );
    return;
  }

  // Real run: reset only the requested, currently-SUCCESS lawIds to PENDING
  // so selectQueue() actually processes them against this database. Every
  // other manifest entry (all 947 - found.length of them) is untouched.
  if (alreadySuccess.length > 0) {
    const current = (await store.load())!;
    for (const doc of current.documents) {
      if (requestedSet.has(doc.lawId) && doc.status === LegalInfoDocumentStatus.SUCCESS) {
        doc.status = LegalInfoDocumentStatus.PENDING;
        doc.failureReason = null;
      }
    }
    current.updatedAt = new Date().toISOString();
    await store.save(current);
    console.log(
      `[ingest:legalinfo:local-verified] reset ${alreadySuccess.length} lawId(s) to PENDING for a genuine local fetch: ` +
        alreadySuccess.map((d) => d.lawId).join(", "),
    );
  }

  const stack = await createLegalArchiveStack({ env, usePostgresMetadata: true });
  if (stack.storageKind !== "local" || stack.metadataKind !== "postgres") {
    console.error(`Unexpected stack: storage=${stack.storageKind} metadata=${stack.metadataKind}`);
    process.exit(1);
  }
  const health = await stack.archive.health();
  if (!health.ok) {
    console.error(`Archive storage health check failed: ${health.detail}`);
    process.exit(1);
  }

  const prisma = getPrismaClient();
  const knowledgeRepository = new PrismaKnowledgeRepository(stack.archive, prisma);

  const archivesBefore = await prisma.legalSourceArchive.count();
  const documentsBefore = await prisma.legalKnowledgeDocument.count();
  console.log(`Before: archives=${archivesBefore} documents=${documentsBefore} (in ${redactDatabaseHost(env.DATABASE_URL)})`);

  const queue = new LegalInfoIngestionQueue({
    store,
    archive: stack.archive,
    knowledgeRepository,
    maxDocuments: args.lawIds.length,
    onlyLawIds: args.lawIds,
    retryFailed: true,
    requestDelayMs: LEGALINFO_INGESTION_DEFAULT_REQUEST_DELAY_MS,
    timeoutMs: LEGALINFO_INGESTION_DEFAULT_TIMEOUT_MS,
  });

  const result = await queue.run();

  const archivesAfter = await prisma.legalSourceArchive.count();
  const documentsAfter = await prisma.legalKnowledgeDocument.count();

  const batchDocs = result.manifest.documents.filter((d) => requestedSet.has(d.lawId));
  console.log(
    JSON.stringify(
      {
        attempted: result.attempted,
        succeeded: result.succeeded,
        failed: result.failed,
        skippedDuplicate: result.skippedDuplicate,
        archivesCreated: Math.max(0, archivesAfter - archivesBefore),
        documentsCreated: Math.max(0, documentsAfter - documentsBefore),
        documents: batchDocs.map((d) => ({
          lawId: d.lawId,
          title: d.title,
          status: d.status,
          failureReason: d.failureReason,
          articleCount: d.articleCount,
          chunkCount: d.chunkCount,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`After: archives=${archivesAfter} documents=${documentsAfter}`);

  if (result.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[ingest:legalinfo:local-verified] fatal error:", error);
  process.exit(1);
});
