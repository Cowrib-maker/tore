/**
 * SAFE, OFFLINE Mongolian legal-vocabulary extraction from an already
 * exported knowledge-base snapshot.
 *
 * - Reads a local JSON file (a {@link KnowledgeExport} produced by
 *   `JsonKnowledgeExporter`, or a plain `{ id, text }[]` array)
 * - Runs the pure, deterministic pipeline in
 *   src/domain/mongolian-orthography/corpus-vocabulary.ts
 * - Prints a report to stdout
 *
 * Does NOT connect to any database or the network, and does NOT write to
 * dictionary.ts / legal-lexicon.ts. Promoting a candidate into the shipped
 * dictionary is a separate, human-reviewed edit — this script only
 * produces the candidate list to review.
 *
 * Usage:
 *   npx tsx scripts/extract-legal-vocabulary.ts path/to/knowledge-export.json
 *   npm run extract:legal-vocabulary -- path/to/knowledge-export.json
 */

import { readFileSync } from "node:fs";

import {
  extractVocabularyCandidates,
  fromKnowledgeDocuments,
  selectSafeDictionaryEntries,
  type CorpusDocumentInput,
  type KnowledgeDocumentLike,
} from "../src/domain/mongolian-orthography/corpus-vocabulary";
import { stripLegalHtmlTags } from "../src/engine/knowledge/repository/article-search";

type KnowledgeExportLike = {
  documents: KnowledgeDocumentLike[];
};

function isKnowledgeExport(value: unknown): value is KnowledgeExportLike {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { documents?: unknown }).documents)
  );
}

function isPlainDocumentArray(value: unknown): value is CorpusDocumentInput[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { id?: unknown }).id === "string" &&
        typeof (item as { text?: unknown }).text === "string",
    )
  );
}

function loadDocuments(path: string): CorpusDocumentInput[] {
  const raw = readFileSync(path, "utf8");
  const parsed: unknown = JSON.parse(raw);

  if (isPlainDocumentArray(parsed)) {
    return parsed;
  }
  if (isKnowledgeExport(parsed)) {
    return fromKnowledgeDocuments(parsed.documents, stripLegalHtmlTags);
  }
  throw new Error(
    `Unrecognized input shape at ${path}: expected a KnowledgeExport ({ documents: [...] }) or a plain [{ id, text }] array.`,
  );
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: tsx scripts/extract-legal-vocabulary.ts <path-to-exported-corpus.json>");
    console.error("");
    console.error("This reads a LOCAL file only — it never connects to a database or the network.");
    process.exit(1);
  }

  const documents = loadDocuments(path);
  const result = extractVocabularyCandidates(documents);
  const safe = selectSafeDictionaryEntries(result);

  console.log("Legal vocabulary extraction (offline, deterministic)");
  console.log("=====================================================");
  console.log(`source: ${path}`);
  console.log(`documents: ${result.documentCount}`);
  console.log(`candidates: ${result.candidates.length}`);
  console.log(`rejected (distinct tokens): ${result.rejected.length}`);
  console.log("");

  const byCategory = new Map<string, number>();
  for (const candidate of result.candidates) {
    byCategory.set(candidate.category, (byCategory.get(candidate.category) ?? 0) + 1);
  }
  console.log("By category:");
  for (const [category, count] of [...byCategory.entries()].sort()) {
    console.log(`  ${category}: ${count}`);
  }
  console.log("");

  console.log(`Safe-to-review candidates (not already known, COMMON/LEGAL/MORPHOLOGICAL_STEM only): ${safe.length}`);
  console.log("This list is NOT auto-merged anywhere — review each entry, then hand-add the ones");
  console.log("that are genuinely correct and useful to CORE_DICTIONARY_WORDS / LEGAL_LEXICON_WORDS");
  console.log("/ LEGAL_LEXICON_STEMS in dictionary.ts / legal-lexicon.ts.");
  console.log("");
  for (const entry of safe.slice(0, 200)) {
    const provenance = entry.derivedFrom ? ` (from: ${entry.derivedFrom.join(", ")})` : "";
    console.log(
      `  [${entry.category}] ${entry.word} — occ=${entry.occurrenceCount}, docs=${entry.documentFrequency}${provenance}`,
    );
  }
  if (safe.length > 200) {
    console.log(`  ... and ${safe.length - 200} more`);
  }
}

main();
