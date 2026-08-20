/**
 * Discover LegalInfo legislation from official category list endpoints
 * and write a resumable machine-readable manifest.
 *
 * Does NOT download law detail pages / does NOT run full-corpus ingestion.
 *
 * Usage:
 *   npx tsx scripts/discover-legalinfo.ts
 *   npm run discover:legalinfo
 */

import { join } from "node:path";

import {
  FileLegalInfoManifestStore,
  LEGALINFO_CONSTITUTION_CATEGORY_ID,
  LEGALINFO_STATUTE_CATEGORY_ID,
  LegalInfoDiscoverer,
  LegalInfoDocumentStatus,
} from "../src/engine/knowledge";

async function main() {
  const manifestPath = join(
    process.cwd(),
    "tmp",
    "legalinfo-discovery-manifest.json",
  );
  const store = new FileLegalInfoManifestStore(manifestPath);
  const existing = await store.load();

  const discoverer = new LegalInfoDiscoverer({
    categoryIds: [
      LEGALINFO_CONSTITUTION_CATEGORY_ID,
      LEGALINFO_STATUTE_CATEGORY_ID,
    ],
    requestDelayMs: 300,
  });

  console.log("LegalInfo discovery");
  console.log("===================");
  console.log(
    `categories: ${LEGALINFO_CONSTITUTION_CATEGORY_ID}, ${LEGALINFO_STATUTE_CATEGORY_ID}`,
  );
  console.log(`manifest: ${manifestPath}`);
  console.log(
    existing
      ? `resuming discovery merge over ${existing.documents.length} existing docs`
      : "starting fresh manifest",
  );

  const result = await discoverer.discover(existing);
  await store.save(result.manifest);

  const pending = result.manifest.documents.filter(
    (d) => d.status === LegalInfoDocumentStatus.PENDING,
  ).length;
  const success = result.manifest.documents.filter(
    (d) => d.status === LegalInfoDocumentStatus.SUCCESS,
  ).length;
  const failed = result.manifest.documents.filter(
    (d) => d.status === LegalInfoDocumentStatus.FAILED,
  ).length;

  console.log("-------------------");
  console.log(`pages fetched: ${result.pagesFetched}`);
  console.log(`documents discovered: ${result.discoveredCount}`);
  console.log(`PENDING: ${pending}`);
  console.log(`SUCCESS (preserved): ${success}`);
  console.log(`FAILED (preserved): ${failed}`);
  console.log(`manifest path: ${manifestPath}`);
  console.log(
    "checkpoint: lastDiscoveryPageByCategory=",
    JSON.stringify(result.manifest.checkpoint.lastDiscoveryPageByCategory),
  );
  console.log(
    "Note: detail-page ingestion not run (discovery/manifest/resume layer only).",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
