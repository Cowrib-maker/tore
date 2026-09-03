import { randomUUID } from "node:crypto";

import type {
  CreateEntitlementUsageInput,
  EntitlementUsage,
  EntitlementUsageIncrement,
} from "@/domain/entities/subscription";
import type { EntitlementUsageRepository } from "@/domain/repositories/entitlement-usage-repository";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function periodKey(userId: string, periodStart: Date): string {
  return `${userId}:${periodStart.toISOString().slice(0, 10)}`;
}

export class InMemoryEntitlementUsageRepository
  implements EntitlementUsageRepository
{
  private readonly rows = new Map<string, EntitlementUsage>();

  clear(): void {
    this.rows.clear();
  }

  async getOrCreate(input: CreateEntitlementUsageInput): Promise<EntitlementUsage> {
    const key = periodKey(input.userId, input.periodStart);
    const existing = this.rows.get(key);
    if (existing) return clone(existing);

    const now = new Date();
    const record: EntitlementUsage = {
      id: randomUUID(),
      userId: input.userId,
      subscriptionId: input.subscriptionId ?? null,
      periodStart: input.periodStart,
      caseAnalysisCount: 0,
      documentAnalysisCount: 0,
      legalAiQueryCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      updatedAt: now,
    };
    this.rows.set(key, record);
    return clone(record);
  }

  async increment(
    id: string,
    increment: EntitlementUsageIncrement,
  ): Promise<EntitlementUsage> {
    const current = [...this.rows.values()].find((row) => row.id === id);
    if (!current) throw new Error("Entitlement usage not found");
    const next: EntitlementUsage = {
      ...current,
      caseAnalysisCount:
        current.caseAnalysisCount + (increment.caseAnalysisCount ?? 0),
      documentAnalysisCount:
        current.documentAnalysisCount + (increment.documentAnalysisCount ?? 0),
      legalAiQueryCount:
        current.legalAiQueryCount + (increment.legalAiQueryCount ?? 0),
      inputTokens: current.inputTokens + (increment.inputTokens ?? 0),
      outputTokens: current.outputTokens + (increment.outputTokens ?? 0),
      updatedAt: new Date(),
    };
    this.rows.set(periodKey(next.userId, next.periodStart), next);
    return clone(next);
  }

  async incrementWithinTokenCeilings(
    id: string,
    usage: { inputTokens: number; outputTokens: number },
    inputTokenCeiling: number,
    outputTokenCeiling: number,
  ): Promise<boolean> {
    const current = [...this.rows.values()].find((row) => row.id === id);
    if (
      !current ||
      current.inputTokens + usage.inputTokens > inputTokenCeiling ||
      current.outputTokens + usage.outputTokens > outputTokenCeiling
    ) {
      return false;
    }
    await this.increment(id, usage);
    return true;
  }
}
