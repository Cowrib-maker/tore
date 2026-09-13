/**
 * Regenerates generated/legal-vocabulary.json from the git-tracked HTML
 * fixtures under tests/fixtures/ — the only corpus data available in this
 * environment that's safe (no production DB, no network, no live
 * browser) and reproducible (checked into git) at the same time. See
 * scripts/build-fixture-legal-corpus-export.ts for how the export is
 * built, and src/domain/mongolian-orthography/corpus-vocabulary.ts for
 * the extraction/classification pipeline itself.
 *
 * This script does NOT do the reviewing — APPROVED_WORDS below is a
 * human decision (made once, during the corpus-vocabulary quality audit
 * that produced this script) about which extracted candidates are
 * correct, safe, unambiguous Mongolian words worth shipping. Re-running
 * this script only re-derives the frequency/document-count evidence for
 * those specific words from the current fixtures; it will never silently
 * add a new word just because extraction found one — that always needs a
 * human to add it to APPROVED_WORDS first, with a reason.
 *
 * The corpus behind this is small (3 fixture documents, ~250 words) by
 * necessity — see the audit report for why a larger corpus wasn't used.
 * Because of that, APPROVED_WORDS is deliberately short: only entries
 * that are unambiguous regardless of corpus size were kept.
 *
 * Usage: npx tsx scripts/generate-legal-vocabulary-artifact.ts
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildGeneratedVocabularyArtifact,
  extractVocabularyCandidates,
  type CorpusDocumentInput,
} from "../src/domain/mongolian-orthography/corpus-vocabulary";

/**
 * Words a human confirmed, by reading the extraction output and the
 * source fixtures directly, are correct and safe to ship:
 *  - "үндсэн" ("basic/fundamental") — extremely common constitutional/
 *    legal adjective, missing from the hand-curated dictionary entirely.
 *  - "дүгээр" — the front-vowel-harmony allomorph of the ordinal-numbering
 *    particle used after a numeral in article citations (e.g. "11
 *    дүгээр зүйл" = "Article 11"); "дугаар" (back-vowel allomorph, and
 *    also the separate noun "number") was already known, this one
 *    wasn't. Confirmed NOT a duplicate/typo of "дугаар" — they're
 *    distinct, both-valid vowel-harmony forms.
 */
const APPROVED_WORDS = new Set(["үндсэн", "дүгээр"]);

const FIXTURE_EXPORT_PATH = join(process.cwd(), "tmp", "fixture-legal-corpus-export.json");
const ARTIFACT_PATH = join(process.cwd(), "generated", "legal-vocabulary.json");

function main() {
  // Regenerate the fixture export fresh from tracked source each time so
  // this script is one reproducible step, not dependent on whatever
  // happens to already be sitting in tmp/.
  const stdout = execFileSync(process.execPath, [
    require.resolve("tsx/cli"),
    join(__dirname, "build-fixture-legal-corpus-export.ts"),
  ]);
  writeFileSync(FIXTURE_EXPORT_PATH, stdout);

  const exportData = JSON.parse(stdout.toString("utf8")) as {
    documentCount: number;
    documents: { id: string; articles: { text: string }[] }[];
  };
  const documents: CorpusDocumentInput[] = exportData.documents.map((doc) => ({
    id: doc.id,
    text: doc.articles.map((a) => a.text).join("\n"),
  }));

  const result = extractVocabularyCandidates(documents);
  const approved = result.candidates.filter((c) => APPROVED_WORDS.has(c.word));

  const missing = [...APPROVED_WORDS].filter((word) => !approved.some((c) => c.word === word));
  if (missing.length > 0) {
    console.error(
      `APPROVED_WORDS contains words the current extraction no longer produces: ${missing.join(", ")}. ` +
        "Either the fixtures changed or the pipeline rules changed — investigate before regenerating the artifact.",
    );
    process.exit(1);
  }

  const artifact = buildGeneratedVocabularyArtifact(
    approved,
    {
      description:
        "3 git-tracked legalinfo.mn HTML fixtures (tests/fixtures/legalinfo-367-constitution.html, " +
        "legalinfo-439-bilingual.html, legalinfo-11634-dotted-articles.html), parsed with the production " +
        "LegalInfoLawParser/LegalInfoKnowledgeParser. No production database or network access was used.",
      documentCount: result.documentCount,
    },
    "2026-09-13T00:00:00.000Z", // fixed for reproducible diffs; update by hand when regenerating for real
  );

  mkdirSync(join(process.cwd(), "generated"), { recursive: true });
  writeFileSync(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`Wrote ${artifact.entries.length} approved entries to ${ARTIFACT_PATH}`);
}

main();
