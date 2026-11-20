import { normalizeToken } from "../tokenizer/normalize";

/**
 * User-defined accepted tokens (lawyers' terms, company names, personal
 * names, internal terminology). Engine-level only: persistence/UI belong to
 * the application. Matching is on the normalised form, so "Хууль" and
 * "хууль" are the same entry; the user's own spelling is preserved.
 */
export class UserDictionary {
  private readonly words = new Map<string, string>();

  constructor(initial: Iterable<string> = []) {
    for (const w of initial) this.add(w);
  }

  add(word: string): void {
    const key = normalizeToken(word);
    if (key) this.words.set(key, word);
  }

  remove(word: string): boolean {
    return this.words.delete(normalizeToken(word));
  }

  has(normalizedKey: string): boolean {
    return this.words.has(normalizedKey);
  }

  get size(): number {
    return this.words.size;
  }

  toArray(): string[] {
    return [...this.words.values()].sort((a, b) => a.localeCompare(b, "mn"));
  }
}
