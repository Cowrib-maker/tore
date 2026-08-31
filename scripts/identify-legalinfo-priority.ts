/**
 * Report priority statute lawIds from LegalInfo discovery titles.
 * Does not hard-code lawIds. Does not ingest.
 *
 * Reads tmp/legalinfo-discovery-manifest.json from:
 *   npm run discover:legalinfo
 *
 * Usage:
 *   npm run identify:legalinfo:priority
 */

import { join } from "node:path";

import {
  FileLegalInfoManifestStore,
  identifyPriorityLawsFromDocuments,
  priorityLawIdsForIngest,
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
    console.error(`Discovery manifest not found: ${manifestPath}`);
    console.error(
      "Run npm run discover:legalinfo first. Do not hard-code lawIds. Do not ingest.",
    );
    process.exit(1);
  }

  const result = identifyPriorityLawsFromDocuments(manifest.documents);
  const lawIds = priorityLawIdsForIngest(result);

  const report = {
    manifestPath,
    documentCount: manifest.documents.length,
    lawIdsForIngest: lawIds,
    unambiguous: result.unambiguous.map((row) => ({
      key: row.key,
      lawId: row.lawId,
      title: row.title,
      officialUrl: row.officialUrl,
    })),
    missing: result.missing,
    ambiguous: result.ambiguous.map((key) => ({
      key,
      candidates: result.byKey[key].map((row) => ({
        lawId: row.lawId,
        title: row.title,
      })),
    })),
    ingested: false,
  };

  console.log(JSON.stringify(report, null, 2));

  if (lawIds.length === 0) {
    console.error(
      "No unambiguous priority lawIds. Re-run discover or resolve ambiguous titles manually with --law-ids.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Observed ${lawIds.length} priority lawId(s) for local ingest (not hard-coded): ${lawIds.join(", ")}`,
  );
  console.log(
    "Next: npm run ingest:legalinfo:local-prisma -- --from-priority",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
