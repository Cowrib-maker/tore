/**
 * OFFLINE GOLD-SET EVALUATION — milestone 7 (adversarial orthography
 * evaluation), Section 8.
 *
 * Computes safety/success rates using ONLY the hand-authored, labeled
 * cases in tests/evaluation/adversarial-gold-set.ts. This is NOT a
 * production accuracy measurement: the gold set is small, hand-picked to
 * probe known-risky structural patterns (real edit-distance-1 collisions
 * found by scanning the shipped dictionary, documented past false
 * positives, the task's own legal-term list), and is not a random or
 * representative sample of real user input. A rate below is only as
 * meaningful as its denominator — each one is reported with its raw
 * count, and a rate over a denominator smaller than ~10 is flagged as
 * "TOO SMALL TO GENERALIZE" rather than presented as a headline number.
 *
 * Usage:
 *   npx tsx scripts/compute-gold-set-metrics.ts
 */

import { isKnownMongolianWord, suggestDictionaryWords } from "../src/domain/mongolian-orthography/dictionary";
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

type Rate = { label: string; passed: number; total: number; failures: string[] };

function rate(label: string, total: number, checks: { id: string; pass: boolean }[]): Rate {
  const failures = checks.filter((c) => !c.pass).map((c) => c.id);
  return { label, passed: total - failures.length, total, failures };
}

function printRate(r: Rate) {
  const pct = r.total > 0 ? ((r.passed / r.total) * 100).toFixed(1) : "n/a";
  const flag = r.total < 10 ? "  [TOO SMALL TO GENERALIZE]" : "";
  console.log(`${r.label}: ${r.passed}/${r.total} = ${pct}%${flag}`);
  if (r.failures.length > 0) {
    console.log(`  FAILURES: ${r.failures.join(", ")}`);
  }
}

function main() {
  console.log("=====================================================================");
  console.log("OFFLINE GOLD-SET EVALUATION (milestone 7 — adversarial orthography)");
  console.log("=====================================================================");
  console.log("NOT a production accuracy measurement. Computed only over the");
  console.log("hand-authored cases in tests/evaluation/adversarial-gold-set.ts.");
  console.log("");

  // --- Valid-word safety rate ---
  const validWordCases = [...VALID_WORDS, ...VALID_LEGAL_TERMS];
  const validWordRate = rate(
    "Valid-word safety rate (known + silent)",
    validWordCases.length,
    validWordCases.map((c) => ({
      id: c.word,
      pass: isKnownMongolianWord(c.word) && suggestDictionaryWords(c.word).length === 0,
    })),
  );
  printRate(validWordRate);

  // --- Dangerous-confusion safety rate ---
  const confusionRate = rate(
    "Dangerous-confusion safety rate (neither member ever suggested for the other)",
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
  printRate(confusionRate);

  // --- Typo top-1 success rate ---
  const allTypoCases = [
    ...CURATED_TYPO_MAP_CASES.map((c) => ({ input: c.input, expected: c.expectedCandidate })),
    ...TYPO_CORRECTIONS.map((c) => ({ input: c.input, expected: c.expectedCandidate })),
  ];
  const typoRate = rate(
    "Typo top-1 success rate",
    allTypoCases.length,
    allTypoCases.map((c) => ({
      id: `${c.input}->${c.expected}`,
      pass: suggestDictionaryWords(c.input)[0] === c.expected,
    })),
  );
  printRate(typoRate);

  // --- Silent-on-unknown rate ---
  const unknownRate = rate(
    "Silent-on-unknown rate (genuinely absent words stay unknown)",
    UNKNOWN_WORDS.length,
    UNKNOWN_WORDS.map((c) => ({ id: c.word, pass: !isKnownMongolianWord(c.word) })),
  );
  printRate(unknownRate);

  // --- Morphology safety rate ---
  const morphologyCases = [
    ...VALID_INFLECTED_FORMS.map((c) => ({ word: c.word, expectedKnown: true })),
    ...MORPHOLOGY_BOUNDARY_CASES.map((c) => ({ word: c.word, expectedKnown: c.expectedKnown })),
  ];
  const morphologyRate = rate(
    "Morphology safety rate (boundary + inflected-form cases match expected known-status)",
    morphologyCases.length,
    morphologyCases.map((c) => ({ id: c.word, pass: isKnownMongolianWord(c.word) === c.expectedKnown })),
  );
  printRate(morphologyRate);

  console.log("");
  console.log("Only denominators >= 10 are treated as informative above; smaller ones are");
  console.log("flagged and should be read as anecdotal evidence, not a generalizable rate.");
  console.log("No metric here is 'production accuracy' — that would require a random or");
  console.log("representative sample of real user input, which this gold set is not.");
}

main();
