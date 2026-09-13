/**
 * Performance BASELINE for the Mongolian orthography engine — milestone 7
 * (adversarial evaluation), Section 7.
 *
 * This measures wall-clock cost, not correctness (see
 * scripts/measure-orthography-engine.ts for behavioral rates, and
 * tests/unit/adversarial-gold-set-metrics.test.ts for the labeled-accuracy
 * numbers). The objective, per the milestone spec, is ONLY to establish a
 * baseline at 100 / 1,000 / 10,000 tokens — no optimization is attempted
 * or implied by these numbers.
 *
 * Measures:
 *  - isKnownMongolianWord lookup time (avg, p95) over a fixed token sample
 *  - suggestDictionaryWords (candidate generation) cost over UNKNOWN tokens
 *    from the same sample (known tokens short-circuit before ranking, so
 *    timing them would understate real fuzzy-match cost)
 *  - heap delta from registering the generated-vocabulary artifact
 *    (7 entries today) — registration itself is O(entries), not O(corpus
 *    size), so this is reported once, not per token count
 *
 * This script NEVER calls registerGeneratedVocabulary from any live code
 * path outside itself, and always cleans up via
 * clearGeneratedVocabularyForTests() before exiting, so running it has no
 * side effect on any other script or test run in the same process tree
 * (each is a separate `tsx` invocation anyway, but the symmetry is kept
 * intentional).
 *
 * Usage:
 *   npx tsx scripts/benchmark-orthography-engine.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  clearGeneratedVocabularyForTests,
  dictionarySizeForTests,
  isKnownMongolianWord,
  registerGeneratedVocabulary,
  suggestDictionaryWords,
  type RegisterableVocabularyEntry,
} from "../src/domain/mongolian-orthography/dictionary";
import { buildEvaluationCorpus } from "./build-evaluation-corpus";

const RAW_TOKEN_RE = /[\p{L}]+/gu;
const SAMPLE_SIZES = [100, 1000, 10000] as const;

function percentile(sortedMs: readonly number[], p: number): number {
  if (sortedMs.length === 0) return 0;
  const index = Math.min(sortedMs.length - 1, Math.ceil((p / 100) * sortedMs.length) - 1);
  return sortedMs[Math.max(0, index)]!;
}

function timeCall<T>(fn: () => T): { result: T; ms: number } {
  const start = process.hrtime.bigint();
  const result = fn();
  const end = process.hrtime.bigint();
  return { result, ms: Number(end - start) / 1e6 };
}

/** Builds a fixed-size token sample by repeating the real evaluation
 * corpus's tokens (with a deterministic index-based cycle, not random
 * sampling) up to the requested size — this keeps every size's sample a
 * prefix-compatible extension of the smaller ones and keeps the whole
 * script deterministic run-to-run. */
function buildSample(allTokens: readonly string[], size: number): string[] {
  const sample: string[] = [];
  for (let i = 0; i < size; i++) {
    sample.push(allTokens[i % allTokens.length]!);
  }
  return sample;
}

function formatMs(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(1)}µs` : `${ms.toFixed(3)}ms`;
}

function formatBytes(bytes: number): string {
  const sign = bytes < 0 ? "-" : "+";
  return `${sign}${(Math.abs(bytes) / 1024).toFixed(1)} KiB`;
}

async function main() {
  console.log("Mongolian Orthography Engine — performance BASELINE (not an accuracy report)");
  console.log("==============================================================================");
  console.log(`dictionary size at start: ${dictionarySizeForTests()} complete words`);
  console.log("");

  const corpus = await buildEvaluationCorpus();
  const allTokens = Array.from(
    new Set(
      corpus.documents.flatMap((doc) => Array.from(doc.text.matchAll(RAW_TOKEN_RE)).map((m) => m[0].toLowerCase())),
    ),
  ).filter((t) => t.length >= 2);
  console.log(`token pool drawn from real evaluation corpus: ${allTokens.length} unique normalized tokens`);
  console.log("");

  for (const size of SAMPLE_SIZES) {
    const sample = buildSample(allTokens, size);

    // --- isKnownMongolianWord lookup timing (every token in the sample) ---
    const lookupTimesMs: number[] = [];
    for (const token of sample) {
      const { ms } = timeCall(() => isKnownMongolianWord(token));
      lookupTimesMs.push(ms);
    }
    lookupTimesMs.sort((a, b) => a - b);
    const lookupAvg = lookupTimesMs.reduce((a, b) => a + b, 0) / lookupTimesMs.length;
    const lookupP95 = percentile(lookupTimesMs, 95);

    // --- candidate generation timing (unknown tokens only, since known
    //     tokens short-circuit before any fuzzy ranking ever runs) ---
    const unknownSample = sample.filter((t) => !isKnownMongolianWord(t));
    const suggestTimesMs: number[] = [];
    for (const token of unknownSample) {
      const { ms } = timeCall(() => suggestDictionaryWords(token));
      suggestTimesMs.push(ms);
    }
    suggestTimesMs.sort((a, b) => a - b);
    const suggestAvg = suggestTimesMs.length
      ? suggestTimesMs.reduce((a, b) => a + b, 0) / suggestTimesMs.length
      : 0;
    const suggestP95 = percentile(suggestTimesMs, 95);

    console.log(`--- ${size.toLocaleString()} tokens (${unknownSample.length} unknown in this sample) ---`);
    console.log(`  isKnownMongolianWord: avg=${formatMs(lookupAvg)} p95=${formatMs(lookupP95)}`);
    console.log(
      `  suggestDictionaryWords (unknown tokens only): avg=${formatMs(suggestAvg)} p95=${formatMs(suggestP95)}`,
    );
    console.log("");
  }

  // --- generated-vocabulary registration cost (one-shot, not scaled by
  //     token count — registration cost is O(artifact entries)) ---
  const artifactPath = join(process.cwd(), "generated/legal-vocabulary.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as {
    entries: readonly RegisterableVocabularyEntry[];
  };
  console.log(`--- generated-vocabulary registration cost (${artifact.entries.length} entries) ---`);
  const heapBefore = process.memoryUsage().heapUsed;
  const { ms: registerMs } = timeCall(() => registerGeneratedVocabulary(artifact.entries));
  const heapAfterRegister = process.memoryUsage().heapUsed;
  console.log(`  registerGeneratedVocabulary(${artifact.entries.length} entries): ${formatMs(registerMs)}`);
  console.log(`  heap delta after registration: ${formatBytes(heapAfterRegister - heapBefore)}`);
  clearGeneratedVocabularyForTests();
  const heapAfterClear = process.memoryUsage().heapUsed;
  console.log(`  heap delta after clearGeneratedVocabularyForTests(): ${formatBytes(heapAfterClear - heapAfterRegister)}`);
  console.log("");
  console.log(
    "NOTE: heap numbers are noisy (GC-dependent) single-process samples, not a rigorous memory",
  );
  console.log(
    "profile — they establish an order-of-magnitude baseline only, per the milestone's own framing:",
  );
  console.log('"Do not optimize prematurely... The objective is to establish a baseline."');
}

void main();
