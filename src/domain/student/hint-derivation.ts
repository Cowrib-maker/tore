/**
 * Deterministic hint selection — which element to hint next, and what
 * partial text to reveal. No AI involved: this is pure, testable logic
 * over already-graded elements, so "which hint comes next" never depends
 * on a model call succeeding.
 *
 * A hint is always derived from a predefined LegalElement's own
 * description (via the rubric item, itself derived from the element —
 * see rubric-from-legal-test.ts) and is always a PARTIAL reveal, never
 * the element's full description and never the full model answer.
 */
import type { ElementFeedback, Hint } from "./written-exam-types";
import type { WrittenExamRubricItem } from "./rubric-from-legal-test";

const SATISFIED_STATUS = "SATISFIED";
const HINT_MAX_CHARS = 140;

/**
 * Picks the earliest-ordered REQUIRED rubric item that is not yet
 * SATISFIED and has not already had a hint revealed for it. Returns null
 * once every required element is either satisfied or already hinted —
 * callers should fall back to the full evaluation at that point rather
 * than ask for another hint.
 */
export function deriveNextHint(
  rubric: readonly WrittenExamRubricItem[],
  elementFeedback: readonly ElementFeedback[],
  hintsAlreadyRevealed: readonly Hint[],
): Hint | null {
  const statusByElement = new Map(elementFeedback.map((f) => [f.elementId, f.status]));
  const revealedIds = new Set(hintsAlreadyRevealed.map((h) => h.elementId));

  const sorted = [...rubric].sort((a, b) => a.order - b.order);
  const next = sorted.find((item) => {
    if (!item.required) return false;
    if (revealedIds.has(item.elementId)) return false;
    const status = statusByElement.get(item.elementId);
    return status !== SATISFIED_STATUS;
  });

  if (!next) {
    return null;
  }

  return {
    elementId: next.elementId,
    label: next.label,
    text: partialReveal(next.description),
    provenance: next.provenance,
  };
}

/**
 * Partial reveal: the first clause/sentence only, hard-capped, so a hint
 * can never accidentally become the full model answer even for a short
 * description.
 */
function partialReveal(description: string): string {
  const firstSentence = description.split(/(?<=[.!?])\s/)[0] ?? description;
  const truncated =
    firstSentence.length > HINT_MAX_CHARS
      ? `${firstSentence.slice(0, HINT_MAX_CHARS).trimEnd()}…`
      : firstSentence;
  return `Санамж: ${truncated}`;
}
