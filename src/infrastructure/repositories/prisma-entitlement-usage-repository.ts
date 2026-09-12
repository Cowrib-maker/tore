import type {
  CreateEntitlementUsageInput,
  EntitlementUsage,
  EntitlementUsageIncrement,
} from "@/domain/entities/subscription";
import type { EntitlementUsageRepository } from "@/domain/repositories/entitlement-usage-repository";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";
import { mapEntitlementUsage } from "@/infrastructure/mappers/subscription.mapper";

export class PrismaEntitlementUsageRepository
  implements EntitlementUsageRepository
{
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async getOrCreate(input: CreateEntitlementUsageInput): Promise<EntitlementUsage> {
    const record = await this.db.entitlementUsage.upsert({
      where: {
        userId_periodStart: {
          userId: input.userId,
          periodStart: input.periodStart,
        },
      },
      update: {
        ...(input.subscriptionId
          ? { subscriptionId: input.subscriptionId }
          : {}),
      },
      create: {
        userId: input.userId,
        subscriptionId: input.subscriptionId ?? null,
        periodStart: input.periodStart,
      },
    });
    return mapEntitlementUsage(record);
  }

  async increment(
    id: string,
    increment: EntitlementUsageIncrement,
  ): Promise<EntitlementUsage> {
    const record = await this.db.entitlementUsage.update({
      where: { id },
      data: {
        caseAnalysisCount: { increment: increment.caseAnalysisCount ?? 0 },
        documentAnalysisCount: {
          increment: increment.documentAnalysisCount ?? 0,
        },
        legalAiQueryCount: { increment: increment.legalAiQueryCount ?? 0 },
        inputTokens: { increment: increment.inputTokens ?? 0 },
        outputTokens: { increment: increment.outputTokens ?? 0 },
      },
    });
    return mapEntitlementUsage(record);
  }

  async tryReserveLegalAiQuery(id: string, limit: number): Promise<boolean> {
    const result = await this.db.entitlementUsage.updateMany({
      where: { id, legalAiQueryCount: { lt: limit } },
      data: { legalAiQueryCount: { increment: 1 } },
    });
    return result.count > 0;
  }

  async releaseLegalAiQuery(id: string): Promise<void> {
    await this.db.entitlementUsage.updateMany({
      where: { id, legalAiQueryCount: { gt: 0 } },
      data: { legalAiQueryCount: { decrement: 1 } },
    });
  }
}

export const entitlementUsageRepository = new PrismaEntitlementUsageRepository();
