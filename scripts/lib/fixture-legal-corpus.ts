/**
 * Shared, offline builder for a real KnowledgeExport snapshot from the
 * git-tracked HTML fixtures under tests/fixtures/ — no database, no
 * network, no live browser. Runs the exact same parser
 * (LegalInfoKnowledgeParser/LegalInfoLawParser) that production ingestion
 * uses, fed through InMemoryKnowledgeCrawler + the default in-memory
 * repository, so the resulting export is genuinely representative of how
 * real legalinfo.mn documents get stored — just sourced from three
 * already-checked-in real law pages instead of a live crawl.
 *
 * Extracted out of scripts/build-fixture-legal-corpus-export.ts so
 * scripts/build-evaluation-corpus.ts can reuse the exact same parsing
 * call instead of duplicating it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createKnowledgeEngine,
  InMemoryKnowledgeCrawler,
  KnowledgeDocumentKind,
  LegalInfoKnowledgeParser,
  LegalInfoLawParser,
  type KnowledgeExport,
} from "../../src/engine/knowledge";

export const FIXTURE_LEGAL_DOCUMENTS: readonly { sourceId: string; sourceUrl: string; file: string }[] = [
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

export async function buildFixtureKnowledgeExport(): Promise<KnowledgeExport> {
  const jobs = FIXTURE_LEGAL_DOCUMENTS.map((fixture) => {
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
    maxDocuments: FIXTURE_LEGAL_DOCUMENTS.length,
  });
  if (result.failed.length > 0) {
    throw new Error(`Failed to parse one or more fixtures: ${JSON.stringify(result.failed)}`);
  }
  if (result.ingested.length !== FIXTURE_LEGAL_DOCUMENTS.length) {
    throw new Error(
      `Expected ${FIXTURE_LEGAL_DOCUMENTS.length} ingested documents, got ${result.ingested.length}.`,
    );
  }

  return engine.exportSnapshot();
}
