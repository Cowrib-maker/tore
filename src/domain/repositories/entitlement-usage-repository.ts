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
}
