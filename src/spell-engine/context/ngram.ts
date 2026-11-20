import type { ContextModel, NGramData } from "./types";

/**
 * Stupid-backoff bigram model: logFit = log P(word|prev) + log P(next|word), each falling back to 0.4 × a smoothed
 * unigram when the bigram was never seen. Deterministic, tiny, explainable. `support` counts the bigrams actually seen.
 */
export class NGramContextModel implements ContextModel {
  readonly kind = "BIGRAM" as const;
  readonly id: string;
  readonly version: string;
  private readonly vocab: number;

  constructor(readonly data: NGramData) {
    this.id = data.id;
    this.version = data.version;
    this.vocab = Math.max(1, Object.keys(data.unigrams).length);
  }

  private uni(w: string): number {
    return Math.log(((this.data.unigrams[w] ?? 0) + 1) / (this.data.total + this.vocab));
  }

  private bi(a: string, b: string): { lp: number; seen: number } {
    const c = this.data.bigrams[`${a} ${b}`] ?? 0;
    const ca = this.data.unigrams[a] ?? 0;
    if (c > 0 && ca > 0) return { lp: Math.log(c / ca), seen: c };
    return { lp: Math.log(0.4) + this.uni(b), seen: 0 };
  }

  logFit(prev: string | null, word: string, next: string | null): number {
    let s = prev === null && next === null ? this.uni(word) : 0;
    if (prev !== null) s += this.bi(prev, word).lp;
    if (next !== null) s += this.bi(word, next).lp;
    return s;
  }

  support(prev: string | null, word: string, next: string | null): number {
    return (prev !== null ? this.bi(prev, word).seen : 0) + (next !== null ? this.bi(word, next).seen : 0);
  }
}
