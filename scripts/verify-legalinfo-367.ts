/**
 * Local verification: fetch LegalInfo lawId=367 (1992 Constitution)
 * through HttpKnowledgeCrawler, then run the knowledge ingestion pipeline.
 *
 * - Does not change createKnowledgeEngine() defaults
 * - Uses in-memory repository + temp archive only (non-destructive)
 * - Network required
 *
 * Usage:
 *   npx tsx scripts/verify-legalinfo-367.ts
 *   npm run verify:legalinfo-367
 */

import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createArchiveService,
  InMemoryArchiveRepository,
  LocalFilesystemArchiveStorage,
  contentSha256Hex,
  sha256Hex,
} from "../src/engine/data/archive";
import {
  createKnowledgeEngine,
  HttpKnowledgeCrawler,
  InMemoryKnowledgeCrawler,
  InMemoryKnowledgeRepository,
  LEGALINFO_CONSTITUTION_LAW_ID,
  LegalInfoKnowledgeParser,
  legalInfoDetailUrl,
} from "../src/engine/knowledge";

async function main() {
  const sourceUrl = legalInfoDetailUrl(LEGALINFO_CONSTITUTION_LAW_ID);
  const archiveDir = await mkdtemp(join(tmpdir(), "tore-legalinfo-367-"));
  const archiveRepository = new InMemoryArchiveRepository();
  const archive = createArchiveService({
    repository: archiveRepository,
    storage: new LocalFilesystemArchiveStorage(archiveDir),
  });

  console.log("LegalInfo verification");
  console.log("----------------------");
  console.log(`source URL: ${sourceUrl}`);
  console.log(`lawId: ${LEGALINFO_CONSTITUTION_LAW_ID}`);
  console.log(`archive dir (temp): ${archiveDir}`);

  const httpCrawler = new HttpKnowledgeCrawler({
    lawIds: [LEGALINFO_CONSTITUTION_LAW_ID],
    archive,
  });

  let exitCode = 0;
  try {
    const rawDocuments = await httpCrawler.crawl({
      sourceId: "legalinfo",
      urls: [sourceUrl],
      maxDocuments: 1,
    });

    if (rawDocuments.length === 0) {
      console.log("ingestion success/failure: FAILURE");
      console.log("reason: crawler returned no documents");
      exitCode = 1;
      return;
    }

    const raw = rawDocuments[0]!;
    const rawHash = sha256Hex(raw.bytes);
    const canonicalHash = contentSha256Hex(raw.bytes);
    const archiveRecord =
      (await archive.findByHash(rawHash)) ??
      (await archive.findByContentHash(canonicalHash));

    console.log(`fetched byte size: ${raw.bytes.byteLength}`);
    console.log(`content type: ${raw.contentType ?? "(none)"}`);
    console.log(
      `archive ID: ${archiveRecord?.archiveId ?? "(not archived)"}`,
    );
    console.log(`raw SHA-256: ${archiveRecord?.sha256 ?? rawHash}`);
    console.log(
      `content SHA-256: ${archiveRecord?.contentSha256 ?? canonicalHash}`,
    );

    const repository = new InMemoryKnowledgeRepository();
    const engine = createKnowledgeEngine({
      // Already fetched once — do not hit the network again.
      crawler: new InMemoryKnowledgeCrawler([raw]),
      parser: new LegalInfoKnowledgeParser(),
      repository,
    });

    const result = await engine.ingest({
      sourceId: "legalinfo",
      urls: [sourceUrl],
      maxDocuments: 1,
    });

    if (result.failed.length > 0 || result.ingested.length === 0) {
      console.log("ingestion success/failure: FAILURE");
      for (const failure of result.failed) {
        console.log(`  failed URL: ${failure.sourceUrl}`);
        console.log(`  reason: ${failure.reason}`);
      }
      exitCode = 1;
      return;
    }

    const stored = result.ingested[0]!;
    console.log(`document title: ${stored.title}`);
    console.log(`article count: ${stored.articles.length}`);
    console.log(`chunk count: ${stored.chunks.length}`);
    console.log(`stored document id: ${stored.id}`);
    console.log(
      `content sha256 (first 16): ${createHash("sha256").update(raw.bytes).digest("hex").slice(0, 16)}`,
    );
    console.log("ingestion success/failure: SUCCESS");
  } catch (error) {
    console.log("ingestion success/failure: FAILURE");
    console.log(
      `reason: ${error instanceof Error ? error.message : String(error)}`,
    );
    exitCode = 1;
  } finally {
    await rm(archiveDir, { recursive: true, force: true }).catch(() => undefined);
  }

  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
