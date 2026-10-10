/**
 * Context model boundary. A context model answers one question: «how well does this word fit between these
 * neighbours?» It never decides validity (the lexicon and morphology do that); it only helps tell two VALID words
 * apart (real-word errors: ус/үс, тор/төр, уул/үүл) and re-rank repairs. Local/offline; AI models would plug in here
 * as optional re-rankers and may never silently override a deterministic verdict.
 */
export interface ContextModel {
  readonly id: string;
  readonly version: string;
  readonly kind: "UNIGRAM" | "BIGRAM" | "TRIGRAM" | "NEURAL";
  /** Natural-log score of `word` given the previous/next WORD keys (lower-case, may be empty). Higher = better fit. */
  logFit(prev: string | null, word: string, next: string | null): number;
  /** How much evidence backs the number above (count of observed n-grams involving `word`): 0 means «no idea». */
  support(prev: string | null, word: string, next: string | null): number;
}

export type NGramData = {
  schema: "tore-spell-ngram/1";
  id: string;
  version: string;
  provenance: { source: string; license: string; redistributable: boolean; dataClass: string; sourceIds?: string[] };
  /** Total token count the counts were taken from. */
  total: number;
  unigrams: Record<string, number>;
  /** "prev word" → count */
  bigrams: Record<string, number>;
  /** "w1 w2 w3" → count (optional; enables the trigram re-ranker) */
  trigrams?: Record<string, number>;
};
