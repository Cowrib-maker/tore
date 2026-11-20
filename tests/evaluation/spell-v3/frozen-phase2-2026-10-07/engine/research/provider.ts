/**
 * Boundary for LOCAL-ONLY language data (data class C/D, docs/spell/DATA-SOURCES.md).
 *
 * A provider answers "is this surface a valid word?" from a resource that may
 * be used on a developer's machine but must never ship (for example a
 * Hunspell dictionary whose licence forbids redistribution). It is a plain
 * interface so the engine stays dependency-free; implementations live in
 * `scripts/spell-data/` and are never imported by the desktop bundle.
 *
 * The engine refuses to accept a provider unless it is told it is running in
 * development, and the package verifier rejects any build that contains one.
 */
export interface ExternalLexiconProvider {
  readonly id: string;
  readonly dataClass: "C_RESEARCH_ONLY" | "D_BENCHMARK_ONLY";
  /** Always false: that is what makes it a research provider. */
  readonly redistributable: false;
  /** True when the lower-case surface is a valid word (any inflected form). */
  accepts(key: string): boolean;
  /** Occurrences per MILLION words of the surface; 0 when never seen / unknown. */
  frequencyPerMillion?(key: string): number;
  /**
   * 0..1: how likely the surface is a proper noun (mostly written capitalised
   * in running text). Names are never "corrected".
   */
  nameLikelihood?(key: string): number;
}

/**
 * Noisy-channel gate for declaring a word MISSPELLED from a research lexicon.
 * Absence from ONE dictionary is weak evidence (dict-mn lacks «түвшин»,
 * «гадны», «хэдийнэ»), so a frequent word is presumed valid and a typo must
 * be rare while its repair is common.
 */
export type ResearchPolicy = {
  /** A token seen more often than this (per million) is presumed valid. */
  maxTokenPerMillion: number;
  /** The best repair must be at least this many times more frequent than the token. */
  minRatio: number;
  /** Above this name likelihood the token is never flagged. */
  maxNameLikelihood: number;
  /** Weight of edit cost against log-frequency in repair ranking. */
  costWeight: number;
  /**
   * Required lead of the best repair over the runner-up (score units: one unit
   * = 10× frequency). Below it the case is ambiguous → UNKNOWN, not a guess.
   */
  minMargin: number;
};

export const DEFAULT_RESEARCH_POLICY: ResearchPolicy = {
  maxTokenPerMillion: 0.4,
  minRatio: 100,
  maxNameLikelihood: 0.5,
  costWeight: 1.5,
  minMargin: 1.5,
};

export class ResearchDataForbiddenError extends Error {
  constructor() {
    super("Research (class C/D) language data may only be used with environment 'development'; refusing to construct the engine.");
    this.name = "ResearchDataForbiddenError";
  }
}
