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
  /**
   * Atomically increments `legalAiQueryCount` by 1 only if it is currently
   * below `limit`. Returns whether the reservation succeeded. This is the
   * race-safe primitive behind authorizing a new legal question: it must
   * be a single database-level conditional write, not a separate
   * read-then-compare-then-write sequence, so that two concurrent callers
   * cannot both succeed past the same limit.
   */
  tryReserveLegalAiQuery(id: string, limit: number): Promise<boolean>;
  /**
   * Compensating decrement for a reservation whose turn ultimately failed.
   * Guarded against going below 0.
   */
  releaseLegalAiQuery(id: string): Promise<void>;
}
