/**
 * SAFE, OFFLINE builder for a real KnowledgeExport snapshot from the
 * git-tracked HTML fixtures under tests/fixtures/ — no database, no
 * network, no live browser. Runs the exact same parser
 * (LegalInfoKnowledgeParser/LegalInfoLawParser) that production ingestion
 * uses, fed through InMemoryKnowledgeCrawler + the default in-memory
 * repository, so the resulting export is genuinely representative of how
 * real legalinfo.mn documents get stored — just sourced from three
 * already-checked-in real law pages instead of a live crawl.
 *
 * This exists because tests/fixtures/*.html are the only corpus data
 * available in this environment that is unambiguously safe to use for
 * corpus-vocabulary experimentation (production Neon and any live
 * TORE/legalinfo endpoint are explicitly off-limits). It gives
 * scripts/extract-legal-vocabulary.ts a real, reproducible, git-backed
 * input instead of requiring hand-written test strings.
 *
 * Usage:
 *   npx tsx scripts/build-fixture-legal-corpus-export.ts > tmp/fixture-legal-corpus-export.json
 *   npm run extract:legal-vocabulary -- tmp/fixture-legal-corpus-export.json
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createKnowledgeEngine,
  InMemoryKnowledgeCrawler,
  KnowledgeDocumentKind,
  LegalInfoKnowledgeParser,
  LegalInfoLawParser,
} from "../src/engine/knowledge";

const FIXTURES: { sourceId: string; sourceUrl: string; file: string }[] = [
  {
    sourceId: "legalinfo",
    sourceUrl: "https://legalinfo.mn/mn/detail?lawId=367",
    file: "legalinfo-367-constitution.html",
  },
  {
    sourceId: "legalinfo",
    sourceUrl: "https://legalinfo.mn/mn/detail?lawId=439",
    file: "legalinfo-439-bilingual.html",
  },
  {
    sourceId: "legalinfo",
    sourceUrl: "https://legalinfo.mn/mn/detail?lawId=11634",
    file: "legalinfo-11634-dotted-articles.html",
  },
];

async function main() {
  const jobs = FIXTURES.map((fixture) => {
    const html = readFileSync(join(process.cwd(), "tests/fixtures", fixture.file), "utf8");
    return {
      sourceId: fixture.sourceId,
      sourceUrl: fixture.sourceUrl,
      kind: KnowledgeDocumentKind.HTML,
      bytes: new TextEncoder().encode(html),
      contentType: "text/html; charset=utf-8",
      fetchedAt: new Date("2026-01-01T00:00:00.000Z"), // fixed, for reproducible output
    };
  });

  const engine = createKnowledgeEngine({
    crawler: new InMemoryKnowledgeCrawler(jobs),
    parser: new LegalInfoKnowledgeParser(new LegalInfoLawParser()),
  });

  // InMemoryKnowledgeCrawler.crawl() returns every configured document in
  // one call (it's stateless, not a queue) — one ingest() with
  // maxDocuments >= the fixture count processes all of them.
  const result = await engine.ingest({
    sourceId: "legalinfo",
    maxDocuments: FIXTURES.length,
  });
  if (result.failed.length > 0) {
    console.error("Failed to parse one or more fixtures:", result.failed);
    process.exit(1);
  }
  if (result.ingested.length !== FIXTURES.length) {
    console.error(
      `Expected ${FIXTURES.length} ingested documents, got ${result.ingested.length}.`,
    );
    process.exit(1);
  }

  const snapshot = await engine.exportSnapshot();
  process.stdout.write(JSON.stringify(snapshot, null, 2));
}

void main();
