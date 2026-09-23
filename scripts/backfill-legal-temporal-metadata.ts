/**
 * LOCAL-ONLY backfill of LegalKnowledgeDocument.validFrom, using the
 * deterministic effective-date extraction in
 * engine/knowledge/adapters/mongolia/legalinfo/html.ts (adoption-date
 * filter widget + classifyEntryIntoForceClause). This is a data UPDATE
 * against existing rows, not a schema change — no `prisma migrate` of
 * any kind is invoked or required.
 *
 * Deliberately does NOT touch validTo: no document in the local corpus
 * has real evidence of an explicit end date (a validTo is not "when a
 * repeal happens" — see resolve-legal-temporal-status.ts's doc comment —
 * and this phase found no source that states one directly).
 *
 * Idempotent: re-running against the same archived HTML computes the
 * identical value and issues the identical UPDATE — never duplicates,
 * never drifts.
 *
 * Usage:
 *   npm run backfill:temporal-metadata -- --dry-run
 *   npm run backfill:temporal-metadata
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { classifyDatabaseUrl } from "./lib/database-url-safety";
import { LocalFilesystemArchiveStorage } from "../src/engine/data/archive";
import { extractLegalInfoMetadata } from "../src/engine/knowledge/adapters/mongolia/legalinfo/html";

const ARCHIVE_ROOT_DIR = ".data/legal-archive";

function loadEnvLocalDatabaseUrl(): string {
  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  const content = readFileSync(envLocalPath, "utf8");
  const match = content.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/m);
  if (!match) {
    throw new Error(
      "[backfill:temporal-metadata] DATABASE_URL not found in .env.local — refusing to guess a target database.",
    );
  }
  return match[1].trim();
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const databaseUrl = loadEnvLocalDatabaseUrl();
  const classification = classifyDatabaseUrl(databaseUrl);
  if (classification.kind !== "local") {
    console.error(
      `[backfill:temporal-metadata] Refusing to run: .env.local's DATABASE_URL is not local (${classification.kind}).`,
    );
    process.exit(1);
  }

  console.log(
    `[backfill:temporal-metadata] target: ${classification.hostname} | mode: ${dryRun ? "DRY RUN (no writes)" : "REAL RUN"}`,
  );

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  const archiveStorage = new LocalFilesystemArchiveStorage(path.resolve(process.cwd(), ARCHIVE_ROOT_DIR));

  const report = {
    documentsScanned: 0,
    issuedOnExtracted: 0,
    effectiveOnResolved: 0,
    validFromUpdated: 0,
    validFromUnchanged: 0,
    errors: [] as string[],
  };

  try {
    const documents = await prisma.legalKnowledgeDocument.findMany({
      select: { id: true, lawId: true, title: true, archiveId: true, validFrom: true },
    });
    report.documentsScanned = documents.length;

    const archiveIds = [...new Set(documents.map((d) => d.archiveId))];
    const archives = await prisma.legalSourceArchive.findMany({
      where: { id: { in: archiveIds } },
      select: { id: true, storageKey: true, mimeType: true },
    });
    const archiveById = new Map(archives.map((a) => [a.id, a]));

    for (const document of documents) {
      const archive = archiveById.get(document.archiveId);
      if (!archive || !archive.mimeType.toLowerCase().startsWith("text/html")) {
        continue;
      }
      try {
        const bytes = await archiveStorage.get(archive.storageKey);
        if (!bytes) {
          report.errors.push(`archive bytes missing for document ${document.id}`);
          continue;
        }
        const html = new TextDecoder("utf-8").decode(bytes);
        const meta = extractLegalInfoMetadata(html, undefined);
        if (meta.issuedOn) report.issuedOnExtracted += 1;
        if (meta.effectiveOn) report.effectiveOnResolved += 1;

        if (meta.effectiveOn !== document.validFrom) {
          if (!dryRun) {
            await prisma.legalKnowledgeDocument.update({
              where: { id: document.id },
              data: { validFrom: meta.effectiveOn },
            });
          }
          report.validFromUpdated += 1;
        } else {
          report.validFromUnchanged += 1;
        }
      } catch (error) {
        report.errors.push(
          `failed processing document ${document.id} (lawId ${document.lawId}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[backfill:temporal-metadata] fatal error:", error);
  process.exit(1);
});
