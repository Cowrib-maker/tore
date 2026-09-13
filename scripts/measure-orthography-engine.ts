/**
 * Measures the CURRENT Mongolian orthography engine (unchanged
 * hand-curated dictionary — generated vocabulary is never registered
 * here) against the combined evaluation corpus
 * (scripts/build-evaluation-corpus.ts).
 *
 * Reports token-level statistics only — this is NOT an accuracy
 * evaluation, because there is no labeled gold set covering "for every
 * token in this corpus, here is the definitely-correct spelling." The
 * hand-reviewed gold set in tests/evaluation/mongolian-legal-gold-set.ts
 * covers a curated set of specific cases instead (see
 * tests/unit/mongolian-legal-evaluation-corpus.test.ts for those
 * results) — this script's numbers describe engine BEHAVIOR (how often
 * it flags/suggests/stays silent), not correctness.
 *
 * Usage:
 *   npx tsx scripts/measure-orthography-engine.ts
 */

import { isKnownMongolianWord, scoreCandidate, suggestDictionaryWords } from "../src/domain/mongolian-orthography/dictionary";
import { buildEvaluationCorpus } from "./build-evaluation-corpus";

const RAW_TOKEN_RE = /[\p{L}]+/gu;

async function main() {
  const corpus = await buildEvaluationCorpus();

  const uniqueTokens = new Set<string>();
  let totalTokenOccurrences = 0;
  for (const doc of corpus.documents) {
    for (const match of doc.text.match(RAW_TOKEN_RE) ?? []) {
      const normalized = match.toLowerCase();
      if (normalized.length < 2) continue;
      uniqueTokens.add(normalized);
      totalTokenOccurrences += 1;
    }
  }

  let knownCount = 0;
  let unknownCount = 0;
  let zeroCandidateCount = 0;
  const candidateCountDistribution: Record<string, number> = {};
  const confidenceDistribution: Record<string, number> = {
    "no_suggestion": 0,
    "0.4-0.5": 0,
    "0.5-0.6": 0,
    "0.6-0.7": 0,
    "0.7-0.8": 0,
    "0.8-1.0": 0,
  };
  let ambiguousCount = 0; // top-2 candidates within 0.05 of each other
  let highConfidenceCount = 0; // top candidate score >= 0.6

  for (const token of uniqueTokens) {
    if (isKnownMongolianWord(token)) {
      knownCount += 1;
      continue;
    }
    unknownCount += 1;
    const candidates = suggestDictionaryWords(token);
    const bucket = String(candidates.length);
    candidateCountDistribution[bucket] = (candidateCountDistribution[bucket] ?? 0) + 1;

    if (candidates.length === 0) {
      zeroCandidateCount += 1;
      confidenceDistribution["no_suggestion"] += 1;
      continue;
    }

    const scores = candidates.map((c) => scoreCandidate(token, c));
    const topScore = Math.max(...scores);
    if (topScore < 0.5) confidenceDistribution["0.4-0.5"] += 1;
    else if (topScore < 0.6) confidenceDistribution["0.5-0.6"] += 1;
    else if (topScore < 0.7) confidenceDistribution["0.6-0.7"] += 1;
    else if (topScore < 0.8) confidenceDistribution["0.7-0.8"] += 1;
    else confidenceDistribution["0.8-1.0"] += 1;

    if (topScore >= 0.6) highConfidenceCount += 1;
    if (scores.length >= 2) {
      const sorted = [...scores].sort((a, b) => b - a);
      if (sorted[0]! - sorted[1]! < 0.05) ambiguousCount += 1;
    }
  }

  console.log("Mongolian Orthography Engine — token-level measurement");
  console.log("========================================================");
  console.log(`corpus documents: ${corpus.documentCount} (fixture: ${corpus.categoryCounts.fixture}, student: ${corpus.categoryCounts.student})`);
  console.log(`total token occurrences: ${totalTokenOccurrences}`);
  console.log(`unique normalized tokens: ${uniqueTokens.size}`);
  console.log("");
  console.log(`known-token rate: ${knownCount}/${uniqueTokens.size} = ${((knownCount / uniqueTokens.size) * 100).toFixed(1)}%`);
  console.log(`unknown-token rate: ${unknownCount}/${uniqueTokens.size} = ${((unknownCount / uniqueTokens.size) * 100).toFixed(1)}%`);
  console.log(`  of which zero-candidate: ${zeroCandidateCount}/${unknownCount} = ${((zeroCandidateCount / unknownCount) * 100).toFixed(1)}%`);
  console.log(`  of which produce >=1 candidate: ${unknownCount - zeroCandidateCount}/${unknownCount} = ${(((unknownCount - zeroCandidateCount) / unknownCount) * 100).toFixed(1)}%`);
  console.log("");
  console.log("candidate-count distribution (unknown tokens only):", candidateCountDistribution);
  console.log("top-1 confidence distribution (unknown tokens with >=1 candidate):", confidenceDistribution);
  console.log(`ambiguous rate (top-2 candidates within 0.05, of tokens with >=2 candidates): ${ambiguousCount}`);
  console.log(`high-confidence suggestion rate (score >= 0.6, of unknown tokens): ${highConfidenceCount}/${unknownCount} = ${((highConfidenceCount / unknownCount) * 100).toFixed(1)}%`);
  console.log("");
  console.log("NOTE: no accuracy percentage is reported. These are behavioral rates");
  console.log("(known/unknown/silent/suggested), not correctness rates — there is no");
  console.log("token-level labeled gold set to compute accuracy against.");
}

void main();
