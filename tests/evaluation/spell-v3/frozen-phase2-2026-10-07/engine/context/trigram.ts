import type { NGramData } from "./types";

/**
 * Trigram context scoring for RE-RANKING repairs (never for deciding validity).
 *
 * Window around the word under repair: l2 l1 [w] r1 r2 (lower-case word keys, null at a boundary). The score is
 * log P(w | l2 l1) + log P(r1 | l1 w) + log P(r2 | w r1), each term by stupid backoff (trigram → 0.4 × bigram → 0.16 × unigram),
 * so the model degrades gracefully when the corpus has not seen the exact window. `support` counts the n-grams actually seen
 * (a score built only from backoff unigrams carries support 0: «no idea»). Deterministic, explainable, local.
 */
export type Window = { l2: string | null; l1: string | null; r1: string | null; r2: string | null };

export type CountLookup = (key: string) => number;

/** Every n-gram key whose count is needed to score `word` in `win` (used to collect counts in one streaming pass). */
export function ngramKeys(win: Window, word: string): string[] {
  const k: string[] = [word];
  const { l2, l1, r1, r2 } = win;
  if (l1) k.push(l1, `${l1} ${word}`);
  if (l2 && l1) k.push(`${l2} ${l1}`, `${l2} ${l1} ${word}`);
  if (r1) k.push(r1, `${word} ${r1}`);
  if (l1 && r1) k.push(`${l1} ${word} ${r1}`);
  if (r1 && r2) k.push(r2, `${word} ${r1} ${r2}`);
  return k;
}

export class TrigramModel {
  readonly kind = "TRIGRAM" as const;
  private readonly vocab: number;

  constructor(
    private readonly count: CountLookup,
    private readonly total: number,
    vocab: number,
    readonly id = "trigram-local",
    readonly version = "local",
  ) {
    this.vocab = Math.max(1, vocab);
  }

  static fromData(d: NGramData): TrigramModel {
    const all: Record<string, number> = { ...d.unigrams, ...d.bigrams, ...(d.trigrams ?? {}) };
    return new TrigramModel((k) => all[k] ?? 0, d.total, Object.keys(d.unigrams).length, d.id, d.version);
  }

  private uni(w: string): number {
    return (this.count(w) + 1) / (this.total + this.vocab);
  }

  /** P(w3 | w1 w2) by stupid backoff; `seen` is 1 when the trigram or bigram level answered. */
  private cond(h1: string | null, h2: string | null, w: string): { p: number; seen: number } {
    if (h1 && h2) {
      const c3 = this.count(`${h1} ${h2} ${w}`);
      const ch = this.count(`${h1} ${h2}`);
      if (c3 > 0 && ch > 0) return { p: c3 / ch, seen: c3 };
    }
    if (h2) {
      const c2 = this.count(`${h2} ${w}`);
      const ch = this.count(h2);
      if (c2 > 0 && ch > 0) return { p: 0.4 * (c2 / ch), seen: c2 };
    }
    return { p: 0.16 * this.uni(w), seen: 0 };
  }

  score(win: Window, word: string): { logFit: number; support: number } {
    const { l2, l1, r1, r2 } = win;
    let s = 0;
    let sup = 0;
    const a = this.cond(l2, l1, word);
    s += Math.log(a.p);
    sup += a.seen;
    if (r1) {
      const b = this.cond(l1, word, r1);
      s += Math.log(b.p);
      sup += b.seen;
      if (r2) {
        const c = this.cond(word, r1, r2);
        s += Math.log(c.p);
        sup += c.seen;
      }
    }
    return { logFit: s, support: sup };
  }

  /** Candidates ordered by context fit. `decisive` only when the winner leads the runner-up by `minDelta` nats with real support. */
  rerank(win: Window, candidates: readonly string[], opts: { minDelta?: number; minSupport?: number } = {}) {
    const minDelta = opts.minDelta ?? 2;
    const minSupport = opts.minSupport ?? 3;
    const scored = candidates.map((text, i) => ({ text, i, ...this.score(win, text) })).sort((a, b) => b.logFit - a.logFit || a.i - b.i);
    const decisive = scored.length >= 2 && scored[0]!.support >= minSupport && scored[0]!.logFit - scored[1]!.logFit >= minDelta;
    return { ordered: scored, decisive };
  }
}
