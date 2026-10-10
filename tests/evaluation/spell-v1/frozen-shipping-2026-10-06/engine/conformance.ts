import type { CheckResult } from "./contracts";

/**
 * Invariants every engine's output must satisfy regardless of its quality.
 * Returns human-readable violations (empty = conformant). Used by contract
 * tests for each engine; says nothing about *accuracy*, which is measured
 * separately against labelled gold sets.
 */
export function checkResultViolations(text: string, result: CheckResult): string[] {
  const violations: string[] = [];
  if (result.stats.characterCount < 0 || result.stats.wordCount < 0) {
    violations.push("stats must be non-negative");
  }
  const seenIds = new Set<string>();
  let previousStart = -1;
  for (const issue of result.issues) {
    const { start, end } = issue.span;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > text.length || start >= end) {
      violations.push(`issue ${issue.id}: span [${start},${end}) is out of bounds`);
      continue;
    }
    if (text.slice(start, end) !== issue.original) {
      violations.push(`issue ${issue.id}: original does not match the text at its span`);
    }
    if (seenIds.has(issue.id)) violations.push(`issue ${issue.id}: duplicate id`);
    seenIds.add(issue.id);
    if (start < previousStart) violations.push(`issue ${issue.id}: issues must be ordered by start`);
    previousStart = start;
    issue.suggestions.forEach((s, i) => {
      if (s.rank !== i + 1) violations.push(`issue ${issue.id}: suggestion ranks must be 1..n in order`);
      if (!s.text) violations.push(`issue ${issue.id}: empty suggestion text`);
    });
  }
  return violations;
}
