/** Deterministic lookup key for citations. Not a legal-text rewrite. */
export function normalizeCitation(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\u00a0/g, " ")
    .replace(/[«»“”„"']/g, "")
    .replace(/[,:;]+/g, " ")
    .replace(/(\d)([A-Za-zА-Яа-яЁёӨөҮү])/gu, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

export function uniqueStrings(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (!trimmed) {
      continue;
    }
    const key = normalizeCitation(trimmed);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
