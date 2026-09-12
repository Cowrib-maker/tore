/**
 * Lifetime (never period-resetting) free-question counter for unpaid
 * citizens — see UnpaidCitizenLegalQuestionUsage in prisma/schema.prisma
 * for why this is a dedicated table rather than reusing EntitlementUsage.
 */
export interface UnpaidCitizenLegalQuestionUsageRepository {
  /**
   * Atomically reserves one unit for `userId` if their lifetime count is
   * currently below `limit`, creating their usage row on first use. Must
   * be a single database-level conditional write (row creation and the
   * conditional increment both handled atomically, e.g. via
   * `INSERT ... ON CONFLICT DO UPDATE ... WHERE`), not a separate
   * read-then-compare-then-write sequence — otherwise two concurrent
   * first-time callers (or two concurrent callers at the limit boundary)
   * could both succeed. Returns whether the reservation succeeded.
   */
  tryReserve(userId: string, limit: number): Promise<boolean>;
  /**
   * Compensating decrement for a reservation whose turn ultimately
   * failed. Guarded against going below 0. Keyed only by `userId` — this
   * counter has no period, so unlike paid entitlement usage there is no
   * "which period's row" ambiguity to get wrong.
   */
  release(userId: string): Promise<void>;
  /** Current lifetime count, for entitlement-snapshot display. 0 if no row exists yet (never reserved). */
  getUsedCount(userId: string): Promise<number>;
}
