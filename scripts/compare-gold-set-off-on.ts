/**
 * OFF vs ON gold-set comparison + behavioral diff — milestone 8
 * (controlled generated-vocabulary activation), Sections 5 and 6.
 *
 * Section 5: runs the SAME hand-authored adversarial gold set
 * (tests/evaluation/adversarial-gold-set.ts, milestone 7) twice — once
 * with the generated layer OFF, once ON — and reports each safety metric
 * for both states side by side. A generated entry improving coverage is
 * explicitly NOT sufficient on its own (per the milestone's own
 * instruction); what matters is whether ON introduces any NEW failure in
 * a safety-critical category.
 *
 * Section 6: reports, per token, exactly what changed between OFF and ON
 * — known_before/after, suggestions_before/after, confidence_before/after
 * — for every token whose behavior actually differs. Aggregate percentages
 * alone are not the deliverable here; the token-level diff is.
 *
 * Token pool for the behavioral diff: the union of (a) every word in the
 * adversarial gold set, (b) every unique token in the real evaluation
 * corpus (scripts/build-evaluation-corpus.ts) — the same corpus the
 * artifact itself was generated from, so this is exactly the token
 * population most likely to be affected by activation.
 *
 * Usage:
 *   npx tsx scripts/compare-gold-set-off-on.ts
 */

import {
  clearGeneratedVocabularyForTests,
  isKnownMongolianWord,
  scoreCandidate,
  suggestDictionaryWords,
} from "../src/domain/mongolian-orthography/dictionary";
import { initializeGeneratedVocabularyIfEnabled } from "../src/domain/mongolian-orthography/generated-vocabulary-activation";
import { GENERATED_LEGAL_VOCABULARY_V1_FLAG } from "../src/lib/feature-flags";
import { buildEvaluationCorpus } from "./build-evaluation-corpus";
import {
  CURATED_TYPO_MAP_CASES,
  DANGEROUS_NEAR_NEIGHBORS,
  MORPHOLOGY_BOUNDARY_CASES,
  TYPO_CORRECTIONS,
  UNKNOWN_WORDS,
  VALID_INFLECTED_FORMS,
  VALID_LEGAL_TERMS,
  VALID_WORDS,
} from "../tests/evaluation/adversarial-gold-set";

const RAW_TOKEN_RE = /[\p{L}]+/gu;

type Rate = { label: string; passed: number; total: number; failures: string[] };

function rate(label: string, total: number, checks: { id: string; pass: boolean }[]): Rate {
  const failures = checks.filter((c) => !c.pass).map((c) => c.id);
  return { label, passed: total - failures.length, total, failures };
}

function computeGoldSetMetrics(): Rate[] {
  const validWordCases = [...VALID_WORDS, ...VALID_LEGAL_TERMS];
  const validWordRate = rate(
    "Valid-word safety",
    validWordCases.length,
    validWordCases.map((c) => ({
      id: c.word,
      pass: isKnownMongolianWord(c.word) && suggestDictionaryWords(c.word).length === 0,
    })),
  );

  const confusionRate = rate(
    "Dangerous-confusion safety",
    DANGEROUS_NEAR_NEIGHBORS.length,
    DANGEROUS_NEAR_NEIGHBORS.map((c) => ({
      id: `${c.wordA}/${c.wordB}`,
      pass:
        isKnownMongolianWord(c.wordA) &&
        isKnownMongolianWord(c.wordB) &&
        suggestDictionaryWords(c.wordA).length === 0 &&
        suggestDictionaryWords(c.wordB).length === 0,
    })),
  );

  const allTypoCases = [
    ...CURATED_TYPO_MAP_CASES.map((c) => ({ input: c.input, expected: c.expectedCandidate })),
    ...TYPO_CORRECTIONS.map((c) => ({ input: c.input, expected: c.expectedCandidate })),
  ];
  const typoRate = rate(
    "Typo top-1 success",
    allTypoCases.length,
    allTypoCases.map((c) => ({ id: `${c.input}->${c.expected}`, pass: suggestDictionaryWords(c.input)[0] === c.expected })),
  );

  const unknownRate = rate(
    "Silent-on-unknown",
    UNKNOWN_WORDS.length,
    UNKNOWN_WORDS.map((c) => ({ id: c.word, pass: !isKnownMongolianWord(c.word) })),
  );

  const morphologyCases = [
    ...VALID_INFLECTED_FORMS.map((c) => ({ word: c.word, expectedKnown: true })),
    ...MORPHOLOGY_BOUNDARY_CASES.map((c) => ({ word: c.word, expectedKnown: c.expectedKnown })),
  ];
  const morphologyRate = rate(
    "Morphology safety",
    morphologyCases.length,
    morphologyCases.map((c) => ({ id: c.word, pass: isKnownMongolianWord(c.word) === c.expectedKnown })),
  );

  return [validWordRate, confusionRate, typoRate, unknownRate, morphologyRate];
}

type TokenSnapshot = {
  known: boolean;
  suggestions: readonly string[];
  topConfidence: number | null;
};

function snapshotToken(token: string): TokenSnapshot {
  const known = isKnownMongolianWord(token);
  const suggestions = known ? [] : suggestDictionaryWords(token);
  const topConfidence = suggestions.length > 0 ? scoreCandidate(token, suggestions[0]!) : null;
  return { known, suggestions, topConfidence };
}

async function main() {
  console.log("======================================================================");
  console.log("Gold-set OFF vs ON comparison + behavioral diff (milestone 8, Sections 5-6)");
  console.log("======================================================================\n");

  // Build the token pool BEFORE toggling anything, from the real corpus.
  const corpus = await buildEvaluationCorpus();
  const corpusTokens = new Set(
    corpus.documents.flatMap((doc) => Array.from(doc.text.matchAll(RAW_TOKEN_RE)).map((m) => m[0].toLowerCase())),
  );
  const goldSetWords = new Set([
    ...VALID_WORDS.map((c) => c.word),
    ...VALID_LEGAL_TERMS.map((c) => c.word),
    ...VALID_INFLECTED_FORMS.map((c) => c.word),
    ...TYPO_CORRECTIONS.map((c) => c.input),
    ...CURATED_TYPO_MAP_CASES.map((c) => c.input),
    ...DANGEROUS_NEAR_NEIGHBORS.flatMap((c) => [c.wordA, c.wordB]),
    ...MORPHOLOGY_BOUNDARY_CASES.map((c) => c.word),
    ...UNKNOWN_WORDS.map((c) => c.word),
  ]);
  const tokenPool = new Set([...corpusTokens, ...goldSetWords]);

  // --- OFF ---
  delete process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG];
  clearGeneratedVocabularyForTests();
  const offMetrics = computeGoldSetMetrics();
  const offSnapshots = new Map<string, TokenSnapshot>();
  for (const token of tokenPool) offSnapshots.set(token, snapshotToken(token));

  // --- ON ---
  process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG] = "1";
  const activation = initializeGeneratedVocabularyIfEnabled();
  const onMetrics = computeGoldSetMetrics();
  const onSnapshots = new Map<string, TokenSnapshot>();
  for (const token of tokenPool) onSnapshots.set(token, snapshotToken(token));

  delete process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG];
  clearGeneratedVocabularyForTests();

  if (activation.enabled && activation.ok) {
    console.log(`Activated ${activation.registeredCount} TRUSTED entries from ${activation.artifactPath}\n`);
  }

  console.log("--- Section 5: gold-set metrics, OFF vs ON ---");
  console.log("metric".padEnd(30), "OFF".padEnd(16), "ON".padEnd(16), "new failures introduced by ON?");
  let anyNewFailure = false;
  for (let i = 0; i < offMetrics.length; i++) {
    const off = offMetrics[i]!;
    const on = onMetrics[i]!;
    const newFailures = on.failures.filter((f) => !off.failures.includes(f));
    if (newFailures.length > 0) anyNewFailure = true;
    console.log(
      off.label.padEnd(30),
      `${off.passed}/${off.total}`.padEnd(16),
      `${on.passed}/${on.total}`.padEnd(16),
      newFailures.length > 0 ? `YES: ${newFailures.join(", ")}` : "no",
    );
  }
  console.log("");

  console.log("--- Section 6: token-level behavioral diff (OFF -> ON), every changed token ---");
  const changedTokens: {
    input: string;
    known_before: boolean;
    known_after: boolean;
    suggestions_before: readonly string[];
    suggestions_after: readonly string[];
    confidence_before: number | null;
    confidence_after: number | null;
  }[] = [];
  for (const token of tokenPool) {
    const before = offSnapshots.get(token)!;
    const after = onSnapshots.get(token)!;
    const changed =
      before.known !== after.known ||
      JSON.stringify(before.suggestions) !== JSON.stringify(after.suggestions) ||
      before.topConfidence !== after.topConfidence;
    if (changed) {
      changedTokens.push({
        input: token,
        known_before: before.known,
        known_after: after.known,
        suggestions_before: before.suggestions,
        suggestions_after: after.suggestions,
        confidence_before: before.topConfidence,
        confidence_after: after.topConfidence,
      });
    }
  }
  console.log(`${changedTokens.length} token(s) changed out of ${tokenPool.size} checked (corpus tokens + gold-set words):\n`);
  console.log(JSON.stringify(changedTokens, null, 2));

  console.log("\n--- Activation recommendation input ---");
  console.log(`Any new gold-set failure introduced by ON: ${anyNewFailure ? "YES — KEEP DEFAULT OFF" : "no"}`);
}

void main();
