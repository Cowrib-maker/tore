import type { UnpaidCitizenLegalQuestionUsageRepository } from "@/domain/repositories/unpaid-citizen-legal-question-usage-repository";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";

export class PrismaUnpaidCitizenLegalQuestionUsageRepository
  implements UnpaidCitizenLegalQuestionUsageRepository
{
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  /**
   * `INSERT ... ON CONFLICT (user_id) DO UPDATE ... WHERE` handles "row
   * doesn't exist yet" and "row exists and is under the limit" atomically
   * in one round trip. When the row already exists but is at/over the
   * limit, the WHERE clause blocks the UPDATE (Postgres leaves the row
   * unchanged and reports 0 affected rows — no error), so this correctly
   * returns false without a race window. There is no Prisma query-builder
   * equivalent for a conditional ON CONFLICT UPDATE, which is why this
   * uses a parameterized raw statement rather than the fluent API.
   */
  async tryReserve(userId: string, limit: number): Promise<boolean> {
    const affected = await this.db.$executeRaw`
      INSERT INTO "unpaid_citizen_legal_question_usages" ("user_id", "questions_used", "updated_at")
      VALUES (${userId}, 1, now())
      ON CONFLICT ("user_id") DO UPDATE
        SET "questions_used" = "unpaid_citizen_legal_question_usages"."questions_used" + 1,
            "updated_at" = now()
        WHERE "unpaid_citizen_legal_question_usages"."questions_used" < ${limit}
    `;
    return affected > 0;
  }

  async release(userId: string): Promise<void> {
    await this.db.unpaidCitizenLegalQuestionUsage.updateMany({
      where: { userId, questionsUsed: { gt: 0 } },
      data: { questionsUsed: { decrement: 1 } },
    });
  }

  async getUsedCount(userId: string): Promise<number> {
    const row = await this.db.unpaidCitizenLegalQuestionUsage.findUnique({
      where: { userId },
    });
    return row?.questionsUsed ?? 0;
  }
}

export const unpaidCitizenLegalQuestionUsageRepository =
  new PrismaUnpaidCitizenLegalQuestionUsageRepository();
