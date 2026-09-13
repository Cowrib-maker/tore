/**
 * Regenerates generated/legal-vocabulary.json from the combined
 * evaluation corpus (scripts/build-evaluation-corpus.ts: the 3 git-tracked
 * legalinfo.mn HTML fixtures plus TORE's own first-party student-
 * curriculum text) — the largest corpus data available in this
 * environment that's safe (no production DB, no network, no live
 * browser) and reproducible (checked into git) at the same time.
 *
 * This script does NOT do the reviewing — APPROVED_WORDS below is a
 * human decision about which extracted candidates are correct, safe,
 * unambiguous Mongolian words/stems worth shipping. Re-running this
 * script only re-derives the frequency/document-count evidence for those
 * specific words from the current corpus; it will never silently add a
 * new word just because extraction found one — that always needs a
 * human to add it to APPROVED_WORDS first, with a reason.
 *
 * A human decision can outrank the algorithmic trustLevel computed by
 * corpus-vocabulary.ts (e.g. a word confirmed correct by reading the
 * source directly, even though this corpus is still too small for it to
 * clear the numeric TRUSTED bar on frequency alone) — but the script
 * still prints trustLevel per approved word so that gap is visible, not
 * silent.
 *
 * Usage: npx tsx scripts/generate-legal-vocabulary-artifact.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildGeneratedVocabularyArtifact,
  extractVocabularyCandidates,
} from "../src/domain/mongolian-orthography/corpus-vocabulary";
import { buildEvaluationCorpus } from "./build-evaluation-corpus";

/**
 * Words a human confirmed, by reading the extraction output and the
 * source text directly, are correct and safe to ship:
 *  - "үндсэн" ("basic/fundamental") — extremely common constitutional/
 *    legal adjective, missing from the hand-curated dictionary entirely.
 *  - "дүгээр" — the front-vowel-harmony allomorph of the ordinal-numbering
 *    particle used after a numeral in article citations (e.g. "11
 *    дүгээр зүйл" = "Article 11"); "дугаар" (back-vowel allomorph, and
 *    also the separate noun "number") was already known, this one
 *    wasn't. Confirmed NOT a duplicate/typo of "дугаар" — they're
 *    distinct, both-valid vowel-harmony forms.
 *  - "бүр" ("each/every") — a basic, common Mongolian function word;
 *    confirmed via 3 independent case-inflected forms
 *    (бүрдээ/бүрийг/бүрээр), all genuine.
 *  - "үндэслэл" ("basis/grounds/justification") — a real legal-analysis
 *    term, confirmed via 4 independent forms
 *    (үндэслэлгүй/үндэслэлийг/үндэслэлийн/үндэслэлээр).
 *  - "бич" (stem of "бичих", to write) — confirmed via бичнэ/бичсэн (true
 *    verb-stem forms); "бичгээр" also reduces to this stem mechanically
 *    (it's really the elided-vowel noun "бичиг" + instrumental), a
 *    harmless quirk since "бичгээр" is itself a genuine correctly-
 *    spelled word either way — noted, not hidden.
 *  - "шат" ("stage/step") — confirmed via шатны/шаттай/шатыг, all genuine
 *    case-inflected forms of the same common word.
 *  - "акт" ("act/decree", a loanword) — confirmed via
 *    актаар/актаас/актыг, all genuine case-inflected forms.
 */
const APPROVED_WORDS = new Set(["үндсэн", "дүгээр", "бүр", "үндэслэл", "бич", "шат", "акт"]);

const CORPUS_EXPORT_PATH = join(process.cwd(), "tmp", "evaluation-corpus-for-artifact.json");
const ARTIFACT_PATH = join(process.cwd(), "generated", "legal-vocabulary.json");

async function main() {
  // Regenerate the corpus fresh from tracked source each time so this
  // script is one reproducible step, not dependent on whatever happens
  // to already be sitting in tmp/.
  const corpus = await buildEvaluationCorpus();
  mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
  writeFileSync(CORPUS_EXPORT_PATH, JSON.stringify(corpus, null, 2));

  const documents = corpus.documents.map((doc) => ({ id: doc.id, text: doc.text }));
  const result = extractVocabularyCandidates(documents);
  const approved = result.candidates.filter((c) => APPROVED_WORDS.has(c.word));

  const missing = [...APPROVED_WORDS].filter((word) => !approved.some((c) => c.word === word));
  if (missing.length > 0) {
    console.error(
      `APPROVED_WORDS contains words the current extraction no longer produces: ${missing.join(", ")}. ` +
        "Either the corpus changed or the pipeline rules changed — investigate before regenerating the artifact.",
    );
    process.exit(1);
  }

  for (const entry of approved) {
    if (entry.trustLevel !== "TRUSTED") {
      console.warn(
        `NOTE: "${entry.word}" is human-approved but only algorithmically ${entry.trustLevel} ` +
          `(occ=${entry.occurrenceCount}, docFreq=${entry.documentFrequency}) — shipped anyway on the human review, ` +
          "not hidden.",
      );
    }
  }

  const artifact = buildGeneratedVocabularyArtifact(
    approved,
    {
      description:
        "Combined evaluation corpus: 3 git-tracked legalinfo.mn HTML fixtures " +
        "(tests/fixtures/legalinfo-367-constitution.html, legalinfo-439-bilingual.html, " +
        "legalinfo-11634-dotted-articles.html; parsed with the production LegalInfoLawParser/" +
        "LegalInfoKnowledgeParser) plus TORE's own first-party student-curriculum text " +
        "(src/domain/student/*.ts — real Mongolian legal-education prose, not primary legal-source " +
        "text). No production database or network access was used.",
      documentCount: result.documentCount,
    },
    "2026-09-13T00:00:00.000Z", // fixed for reproducible diffs; update by hand when regenerating for real
  );

  mkdirSync(join(process.cwd(), "generated"), { recursive: true });
  writeFileSync(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`Wrote ${artifact.entries.length} approved entries to ${ARTIFACT_PATH}`);
}

void main();
