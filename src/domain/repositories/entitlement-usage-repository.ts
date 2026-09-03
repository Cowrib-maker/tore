import type {
  CreateEntitlementUsageInput,
  EntitlementUsage,
  EntitlementUsageIncrement,
} from "@/domain/entities/subscription";

export interface EntitlementUsageRepository {
  getOrCreate(input: CreateEntitlementUsageInput): Promise<EntitlementUsage>;
  increment(
    id: string,
    increment: EntitlementUsageIncrement,
  ): Promise<EntitlementUsage>;
  incrementWithinTokenCeilings?(
    id: string,
    usage: { inputTokens: number; outputTokens: number },
    inputTokenCeiling: number,
    outputTokenCeiling: number,
  ): Promise<boolean>;
}
