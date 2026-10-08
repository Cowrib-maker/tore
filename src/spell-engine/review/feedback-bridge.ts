/**
 * Connects the three layers without merging them:
 *   user feedback  = a real-world SIGNAL (how many different people hit this)
 *   native review  = linguistic AUTHORITY
 *   the engine     = implementation
 * A feedback group becomes an ordinary review item with provenance AUTOMATIC and NO decision. The number of distinct reporters raises its
 * PRIORITY only; it never sets a verdict, never counts as a reviewer, and never moves any data between tiers.
 */
import { REVIEW_SCHEMA, type ReviewCategory, type SpellReviewItem } from "./review";

export type FeedbackGroupLike = {
  groupKey: string;
  feedbackType: "WRONG_CORRECTION" | "MISSING_ERROR" | "WRONG_SUGGESTION" | "MISSING_WORD" | "GENERAL";
  token: string;
  engineSuggestion: string | null;
  userSuggestion: string | null;
  distinctUsers: number;
  reports: number;
};

const CATEGORY: Record<FeedbackGroupLike["feedbackType"], ReviewCategory> = {
  WRONG_CORRECTION: "MISSPELLED", MISSING_ERROR: "MISSPELLED", WRONG_SUGGESTION: "MISSPELLED", MISSING_WORD: "VALID", GENERAL: "OTHER",
};

export function feedbackGroupsToReviewItems(groups: readonly FeedbackGroupLike[], opts: { at: string }): SpellReviewItem[] {
  return groups
    .filter((g) => g.feedbackType !== "GENERAL" && g.token)
    .map((g) => ({
      schema: REVIEW_SCHEMA as typeof REVIEW_SCHEMA,
      id: `FEEDBACK:${g.groupKey}`,
      datasetVersion: "spell-feedback",
      token: g.token,
      sentenceOrigin: "NONE" as const,
      category: CATEGORY[g.feedbackType],
      currentVerdict: "UNKNOWN" as const,
      currentSuggestion: g.engineSuggestion ?? undefined,
      currentReason: `user report ${g.feedbackType}: ${g.distinctUsers} distinct user(s), ${g.reports} report(s)${g.userSuggestion ? `; users suggest «${g.userSuggestion}»` : ""} — a signal, not an answer`,
      source: "TORE Spell user feedback",
      provenance: "AUTOMATIC" as const,
      priority: g.distinctUsers * 100 + Math.min(g.reports, 99),
      decisions: [{ seq: 1, reviewerId: "user-feedback", reviewerKind: "AUTOMATIC" as const, verdict: "UNKNOWN" as const, at: opts.at }],
    }))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || (a.id < b.id ? -1 : 1));
}
