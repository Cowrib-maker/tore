/**
 * Report the Criminal Code (Эрүүгийн хууль) lawId from LegalInfo discovery
 * output. Does not hard-code a lawId. Does not ingest Criminal Code.
 *
 * Reads tmp/legalinfo-discovery-manifest.json produced by:
 *   npm run discover:legalinfo
 *
 * Usage:
 *   npm run identify:legalinfo:criminal-code
 */

import { join } from "node:path";

import {
  FileLegalInfoManifestStore,
  identifyCriminalCodeFromDocuments,
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
      "Run npm run discover:legalinfo first. Do not hard-code a Criminal Code lawId. Do not ingest.",
    );
    process.exit(1);
  }

  const result = identifyCriminalCodeFromDocuments(manifest.documents);
  const report = {
    manifestPath,
    documentCount: manifest.documents.length,
    matches: result.matches.map((item) => ({
      lawId: item.lawId,
      officialUrl: item.officialUrl,
      title: item.title,
    })),
    skippedRelated: result.skippedRelated,
    ingested: false,
  };

  console.log(JSON.stringify(report, null, 2));

  if (result.matches.length === 1) {
    console.log(
      `Observed Criminal Code lawId from discovery titles (not hard-coded): ${result.matches[0]!.lawId}`,
    );
    console.log("Do not ingest Criminal Code from this command.");
    return;
  }

  if (result.matches.length === 0) {
    console.log(
      "No Criminal Code lawId identified in this discovery output. Re-run npm run discover:legalinfo. Do not hard-code an unknown id. Do not ingest.",
    );
    return;
  }

  console.log(
    `Multiple Criminal Code title matches (${result.matches.length}). Confirm the primary instrument before any ingest. Do not hard-code. Do not ingest.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
