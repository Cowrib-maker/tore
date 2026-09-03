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

  async incrementWithinTokenCeilings(
    id: string,
    usage: { inputTokens: number; outputTokens: number },
    inputTokenCeiling: number,
    outputTokenCeiling: number,
  ): Promise<boolean> {
    const result = await this.db.entitlementUsage.updateMany({
      where: {
        id,
        inputTokens: { lte: inputTokenCeiling - usage.inputTokens },
        outputTokens: { lte: outputTokenCeiling - usage.outputTokens },
      },
      data: {
        inputTokens: { increment: usage.inputTokens },
        outputTokens: { increment: usage.outputTokens },
      },
    });
    return result.count === 1;
  }
}

export const entitlementUsageRepository = new PrismaEntitlementUsageRepository();
