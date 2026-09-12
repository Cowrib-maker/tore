/**
 * One-time backfill: seed UnpaidCitizenLegalQuestionUsage (the new atomic
 * lifetime counter — see prisma/schema.prisma) from the pre-existing
 * historical aggregate, SUM(ai_conversations.billed_question_count) per
 * user, so existing unpaid citizens keep their already-used free
 * questions instead of getting a fresh allowance.
 *
 * Run this ONCE, before flipping enforcement over to the new counter
 * (which already happened in code as part of this change — this script
 * exists to make the live data match what the code now expects to read).
 *
 * SAFETY
 * - Defaults to DRY RUN. Pass --commit to write.
 * - Idempotent: re-running when a user's counter already matches the
 *   aggregate is a no-op for that user (reported as usersAlreadyCorrect).
 * - Never decreases anyone's counter (never "resets to zero" or removes
 *   already-recorded usage) — see computeUnpaidCitizenBackfillPlan's own
 *   comment for exactly when a row is skipped instead of applied.
 * - Never grants additional free questions — the target value is always
 *   exactly the historical aggregate, never higher.
 * - Read-only against `ai_conversations`; only writes to the new
 *   `unpaid_citizen_legal_question_usages` table.
 *
 * Usage:
 *   npm run db:backfill-unpaid-citizen-usage                # dry run
 *   npm run db:backfill-unpaid-citizen-usage -- --commit     # write
 */
import "dotenv/config";

import {
  computeUnpaidCitizenBackfillPlan,
  type UnpaidCitizenBackfillRow,
} from "../src/application/use-cases/entitlements/compute-unpaid-citizen-backfill-plan";
import { prisma } from "../src/infrastructure/database/prisma";

async function loadRows(): Promise<UnpaidCitizenBackfillRow[]> {
  const [aggregates, currentRows] = await Promise.all([
    prisma.aIConversation.groupBy({
      by: ["userId"],
      where: { userId: { not: null } },
      _sum: { billedQuestionCount: true },
    }),
    prisma.unpaidCitizenLegalQuestionUsage.findMany({
      select: { userId: true, questionsUsed: true },
    }),
  ]);

  const currentByUser = new Map(
    currentRows.map((row) => [row.userId, row.questionsUsed]),
  );

  return aggregates
    .filter((row): row is typeof row & { userId: string } => row.userId !== null)
    .map((row) => ({
      userId: row.userId,
      billedTotal: row._sum.billedQuestionCount ?? 0,
      currentCounter: currentByUser.get(row.userId) ?? 0,
    }));
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const commit = process.argv.includes("--commit");
  const rows = await loadRows();
  const plan = computeUnpaidCitizenBackfillPlan(rows);

  if (commit) {
    const toApply = plan.actions.filter((action) => action.kind === "set");
    for (const action of toApply) {
      await prisma.unpaidCitizenLegalQuestionUsage.upsert({
        where: { userId: action.userId },
        create: { userId: action.userId, questionsUsed: action.to },
        update: { questionsUsed: action.to },
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: commit ? "COMMIT (wrote)" : "DRY RUN (no writes)",
        usersSeen: plan.usersSeen,
        usersTouched: plan.usersTouched,
        usersAlreadyCorrect: plan.usersAlreadyCorrect,
        questionsBackfilled: plan.questionsBackfilled,
        mismatches: plan.mismatches,
      },
      null,
      2,
    ),
  );

  if (plan.mismatches.length > 0) {
    console.error(
      `${plan.mismatches.length} user(s) already have a live counter higher than their historical aggregate — not touched. Review before proceeding.`,
    );
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
