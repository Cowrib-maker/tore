/**
 * SymSpell-style candidate index (edit distance 1, Damerau).
 *
 * Instead of comparing a query against every dictionary word, each lexicon
 * key is indexed under itself and under each of its single-character
 * deletions. A query then needs only (1 + length) hash look-ups plus a
 * handful of direct look-ups for transpositions. Lookup cost is independent
 * of dictionary size; the index is built lazily and once.
 */

export type CandidateSource = {
  keys(): IterableIterator<string>;
  has(key: string): boolean;
};

function deletes(word: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < word.length; i += 1) out.push(word.slice(0, i) + word.slice(i + 1));
  return out;
}

/** Damerau (optimal string alignment) distance, early-exit above `limit`. */
export function damerauDistance(a: string, b: string, limit = 2): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > limit) return limit + 1;
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i += 1) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= lb; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2]! + 1);
      }
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > limit) return limit + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[lb]!;
}

export class DeleteIndex {
  private index: Map<string, string[]> | null = null;

  constructor(private readonly source: CandidateSource) {}

  private build(): Map<string, string[]> {
    const index = new Map<string, string[]>();
    const add = (k: string, word: string) => {
      const list = index.get(k);
      if (list) list.push(word);
      else index.set(k, [word]);
    };
    for (const key of this.source.keys()) {
      if (key.length < 2 || key.length > 24) continue;
      add(key, key);
      for (const d of deletes(key)) add(d, key);
    }
    return index;
  }

  /** Number of distinct index keys (diagnostics / memory benchmark). */
  get indexSize(): number {
    return (this.index ??= this.build()).size;
  }

  /** All lexicon keys within Damerau distance 1 of `query` (excluding itself). */
  candidates(query: string): string[] {
    const index = (this.index ??= this.build());
    const found = new Set<string>();
    const probe = (k: string) => {
      const hit = index.get(k);
      if (hit) for (const w of hit) found.add(w);
    };
    probe(query); // query is a deletion of a longer word, or equal
    for (const d of deletes(query)) probe(d);
    // transpositions (distance 1 in OSA, distance 2 as pure deletes)
    for (let i = 0; i + 1 < query.length; i += 1) {
      if (query[i] === query[i + 1]) continue;
      const t = query.slice(0, i) + query[i + 1] + query[i] + query.slice(i + 2);
      if (this.source.has(t)) found.add(t);
    }
    found.delete(query);
    return [...found].filter((w) => damerauDistance(query, w, 1) <= 1);
  }
}
