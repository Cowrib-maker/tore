import type { LanguageIssue, TextSpan } from "./contracts";

/**
 * Stage interfaces for the long-term engine:
 *
 *   Dictionary → Tokenization → Morphological analysis → Spelling detection →
 *   Candidate generation → Suggestion ranking → Grammar/context → Punctuation/style
 *
 * These are TYPES ONLY — Phase 1 ships no implementation of them. They exist
 * so each stage can be replaced and measured independently (against the gold
 * sets in tests/evaluation) without changing `LanguageEngine` or anything that
 * depends on it. An engine need not be built from these stages.
 */

export type Token = {
  span: TextSpan;
  text: string;
  kind: "WORD" | "NUMBER" | "PUNCTUATION" | "WHITESPACE" | "OTHER";
};

export interface Tokenizer {
  tokenize(text: string): readonly Token[];
}

export type MorphologicalAnalysis = {
  token: Token;
  /** Candidate analyses (stem + suffix chain); empty when unanalysable. */
  analyses: readonly { stem: string; suffixes: readonly string[]; score: number }[];
};

export interface MorphologicalAnalyzer {
  analyze(tokens: readonly Token[]): readonly MorphologicalAnalysis[];
}

export interface SpellingDetector {
  detect(analyses: readonly MorphologicalAnalysis[]): readonly LanguageIssue[];
}

export interface CandidateGenerator {
  candidates(issue: LanguageIssue, context: string): readonly string[];
}

export interface SuggestionRanker {
  rank(issue: LanguageIssue, candidates: readonly string[], context: string): readonly string[];
}
