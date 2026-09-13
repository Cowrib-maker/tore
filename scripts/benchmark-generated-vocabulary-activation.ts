/**
 * Performance comparison: generated-vocabulary activation OFF vs ON —
 * milestone 8 (controlled generated-vocabulary activation), Section 4.
 *
 * Reuses the exact benchmark methodology from
 * scripts/benchmark-orthography-engine.ts (0eff277): the same
 * deterministic token sample built from the real evaluation corpus, the
 * same avg/p95 timing approach. This script additionally measures
 * initialization cost (loading + validating + registering the artifact),
 * which the OFF state has no equivalent of.
 *
 * "Do not optimize prematurely... The objective is to establish whether
 * activation introduces meaningful overhead" — this reports numbers, it
 * does not tune anything.
 *
 * Usage:
 *   npx tsx scripts/benchmark-generated-vocabulary-activation.ts
 */

import {
  clearGeneratedVocabularyForTests,
  dictionarySizeForTests,
  isKnownMongolianWord,
  suggestDictionaryWords,
} from "../src/domain/mongolian-orthography/dictionary";
import { initializeGeneratedVocabularyIfEnabled } from "../src/domain/mongolian-orthography/generated-vocabulary-activation";
import { GENERATED_LEGAL_VOCABULARY_V1_FLAG } from "../src/lib/feature-flags";
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

function measureState(label: string, sample: readonly string[]) {
  const lookupTimesMs: number[] = [];
  for (const token of sample) {
    const { ms } = timeCall(() => isKnownMongolianWord(token));
    lookupTimesMs.push(ms);
  }
  lookupTimesMs.sort((a, b) => a - b);
  const lookupAvg = lookupTimesMs.reduce((a, b) => a + b, 0) / lookupTimesMs.length;
  const lookupP95 = percentile(lookupTimesMs, 95);

  const unknownSample = sample.filter((t) => !isKnownMongolianWord(t));
  const suggestTimesMs: number[] = [];
  for (const token of unknownSample) {
    const { ms } = timeCall(() => suggestDictionaryWords(token));
    suggestTimesMs.push(ms);
  }
  suggestTimesMs.sort((a, b) => a - b);
  const suggestAvg = suggestTimesMs.length ? suggestTimesMs.reduce((a, b) => a + b, 0) / suggestTimesMs.length : 0;
  const suggestP95 = percentile(suggestTimesMs, 95);

  console.log(`  [${label}] dictionary size: ${dictionarySizeForTests()} complete words`);
  console.log(`  [${label}] isKnownMongolianWord: avg=${formatMs(lookupAvg)} p95=${formatMs(lookupP95)}`);
  console.log(
    `  [${label}] suggestDictionaryWords (${unknownSample.length} unknown tokens): avg=${formatMs(suggestAvg)} p95=${formatMs(suggestP95)}`,
  );
}

async function main() {
  console.log("Generated-vocabulary activation — OFF vs ON performance comparison");
  console.log("====================================================================");

  const corpus = await buildEvaluationCorpus();
  const allTokens = Array.from(
    new Set(
      corpus.documents.flatMap((doc) => Array.from(doc.text.matchAll(RAW_TOKEN_RE)).map((m) => m[0].toLowerCase())),
    ),
  ).filter((t) => t.length >= 2);

  // --- Initialization cost (OFF has none; ON is load+validate+register) ---
  delete process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG];
  const { ms: offInitMs } = timeCall(() => initializeGeneratedVocabularyIfEnabled());
  console.log(`\nOFF: initializeGeneratedVocabularyIfEnabled() = ${formatMs(offInitMs)} (flag unset, no-op)`);

  process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG] = "1";
  const { result: onInit, ms: onInitMs } = timeCall(() => initializeGeneratedVocabularyIfEnabled());
  console.log(`ON:  initializeGeneratedVocabularyIfEnabled() = ${formatMs(onInitMs)} (load + validate + register)`);
  if (onInit.enabled && onInit.ok) {
    console.log(`     registered ${onInit.registeredCount} TRUSTED entries from ${onInit.artifactPath}`);
  }
  delete process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG];
  clearGeneratedVocabularyForTests(); // reset to baseline before the OFF-state lookup benchmarks below

  for (const size of SAMPLE_SIZES) {
    const sample = buildSample(allTokens, size);
    console.log(`\n--- ${size.toLocaleString()} tokens ---`);

    clearGeneratedVocabularyForTests();
    measureState("OFF", sample);

    process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG] = "1";
    initializeGeneratedVocabularyIfEnabled();
    measureState("ON ", sample);
    delete process.env[GENERATED_LEGAL_VOCABULARY_V1_FLAG];
  }

  clearGeneratedVocabularyForTests();
  console.log("\nNOTE: these are single-process, GC-dependent samples establishing an");
  console.log("order-of-magnitude baseline only, per the milestone's own framing — not a");
  console.log("rigorous profile, and no optimization is implied or attempted here.");
}

void main();
