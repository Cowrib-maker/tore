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
  summarizeVocabularyTrust,
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

  const summary = summarizeVocabularyTrust(result);
  console.log("By category x trust tier (ATTESTED = occurs in corpus; REVIEW = worth a human");
  console.log("look; TRUSTED = clears this pipeline's strictest evidence bar — still not");
  console.log("auto-merge-safe, see selectSafeDictionaryEntries()):");
  for (const [category, tiers] of Object.entries(summary.byCategoryAndTrust).sort()) {
    console.log(`  ${category}: ATTESTED=${tiers.ATTESTED} REVIEW=${tiers.REVIEW} TRUSTED=${tiers.TRUSTED}`);
  }
  console.log("");
  console.log(`Total ATTESTED (candidates + insufficient_evidence rejections): ${summary.totalAttested}`);
  console.log(`Total REVIEW: ${summary.totalReview}`);
  console.log(`Total TRUSTED: ${summary.totalTrusted}`);
  console.log(`Structurally excluded (never treated as a word candidate at all): ${summary.structurallyExcludedCount}`);
  console.log("");

  console.log(`selectSafeDictionaryEntries() output (TRUSTED, not already known): ${safe.length}`);
  console.log("This list is NOT auto-merged anywhere — review each entry, then hand-add the ones");
  console.log("that are genuinely correct and useful to CORE_DICTIONARY_WORDS / LEGAL_LEXICON_WORDS");
  console.log("/ LEGAL_LEXICON_STEMS in dictionary.ts / legal-lexicon.ts, or to APPROVED_WORDS in");
  console.log("scripts/generate-legal-vocabulary-artifact.ts.");
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
