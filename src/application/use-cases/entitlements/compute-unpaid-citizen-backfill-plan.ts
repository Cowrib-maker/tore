/**
 * Pure computation for the one-time unpaid-citizen quota backfill (see
 * scripts/backfill-unpaid-citizen-legal-question-usage.ts). Kept separate
 * from any DB access so it can be unit tested deterministically.
 *
 * Backfill rule (must exactly preserve current semantics): each user's
 * new lifetime counter should equal SUM(ai_conversations.billed_question_count)
 * for that user — the same aggregate `countBilledQuestionsForUser` used to
 * read live, before this fix.
 */

export type UnpaidCitizenBackfillRow = {
  userId: string;
  /** SUM(ai_conversations.billed_question_count) for this user. */
  billedTotal: number;
  /** Current UnpaidCitizenLegalQuestionUsage.questionsUsed, or 0 if no row exists yet. */
  currentCounter: number;
};

export type UnpaidCitizenBackfillAction =
  | { kind: "skip_already_correct"; userId: string; value: number }
  | { kind: "set"; userId: string; from: number; to: number }
  | { kind: "mismatch_would_decrease"; userId: string; from: number; to: number };

export type UnpaidCitizenBackfillPlan = {
  usersSeen: number;
  usersTouched: number;
  usersAlreadyCorrect: number;
  /** Net increase applied across all "set" actions (sum of `to - from`). */
  questionsBackfilled: number;
  /**
   * Rows where the live counter is already HIGHER than the historical
   * aggregate — never silently applied (that would decrease a user's
   * recorded usage, which this backfill must not do). Surfaced for a
   * human to look at instead.
   */
  mismatches: UnpaidCitizenBackfillAction[];
  actions: UnpaidCitizenBackfillAction[];
};

export function computeUnpaidCitizenBackfillPlan(
  rows: UnpaidCitizenBackfillRow[],
): UnpaidCitizenBackfillPlan {
  const actions: UnpaidCitizenBackfillAction[] = [];
  const mismatches: UnpaidCitizenBackfillAction[] = [];
  let usersTouched = 0;
  let usersAlreadyCorrect = 0;
  let questionsBackfilled = 0;

  for (const row of rows) {
    if (row.currentCounter === row.billedTotal) {
      usersAlreadyCorrect += 1;
      actions.push({
        kind: "skip_already_correct",
        userId: row.userId,
        value: row.currentCounter,
      });
      continue;
    }

    if (row.billedTotal < row.currentCounter) {
      // The live counter is already ahead of the historical aggregate —
      // e.g. this script ran once already and real usage has since
      // occurred, or the aggregate itself changed. Applying `billedTotal`
      // here would DECREASE the user's recorded usage, which this
      // backfill must never do. Flag it; do not touch it.
      const action: UnpaidCitizenBackfillAction = {
        kind: "mismatch_would_decrease",
        userId: row.userId,
        from: row.currentCounter,
        to: row.billedTotal,
      };
      mismatches.push(action);
      actions.push(action);
      continue;
    }

    usersTouched += 1;
    questionsBackfilled += row.billedTotal - row.currentCounter;
    actions.push({
      kind: "set",
      userId: row.userId,
      from: row.currentCounter,
      to: row.billedTotal,
    });
  }

  return {
    usersSeen: rows.length,
    usersTouched,
    usersAlreadyCorrect,
    questionsBackfilled,
    mismatches,
    actions,
  };
}
