import type {
  SpellAttemptRepository,
  SpellNonceRepository,
} from "@/domain/repositories/spell-guard-repository";

export const SPELL_ATTEMPT_RETENTION_DAYS = 30;

/**
 * Housekeeping for tables that must not grow forever. NOT scheduled by Phase 1
 * (see docs/spell/README.md → Operations); it must be wired to a cron before
 * production traffic. SpellLicenseEvent is audit data and is never pruned.
 */
export async function pruneSpellTransientData(
  deps: {
    attemptRepository: SpellAttemptRepository;
    nonceRepository: SpellNonceRepository;
  },
  now: Date = new Date(),
): Promise<{ attemptsDeleted: number; noncesDeleted: number }> {
  const cutoff = new Date(now.getTime() - SPELL_ATTEMPT_RETENTION_DAYS * 86_400_000);
  const [attemptsDeleted, noncesDeleted] = await Promise.all([
    deps.attemptRepository.deleteOlderThan(cutoff),
    deps.nonceRepository.deleteExpired(now),
  ]);
  return { attemptsDeleted, noncesDeleted };
}
