/**
 * SAFE, OFFLINE builder for a real KnowledgeExport snapshot from the
 * git-tracked HTML fixtures under tests/fixtures/ — no database, no
 * network, no live browser. See scripts/lib/fixture-legal-corpus.ts for
 * how the export is built (parsed with the real production parser,
 * LegalInfoKnowledgeParser/LegalInfoLawParser, via InMemoryKnowledgeCrawler).
 *
 * This exists because tests/fixtures/*.html are the only *primary legal
 * source* data available in this environment that is unambiguously safe
 * (no production DB, no network) and reproducible (checked into git) at
 * the same time. See scripts/build-evaluation-corpus.ts for a larger,
 * combined evaluation corpus that also includes TORE's own first-party
 * legal-education content.
 *
 * Usage:
 *   npx tsx scripts/build-fixture-legal-corpus-export.ts > tmp/fixture-legal-corpus-export.json
 *   npm run extract:legal-vocabulary -- tmp/fixture-legal-corpus-export.json
 */

import { buildFixtureKnowledgeExport } from "./lib/fixture-legal-corpus";

async function main() {
  const snapshot = await buildFixtureKnowledgeExport();
  process.stdout.write(JSON.stringify(snapshot, null, 2));
}

void main();
