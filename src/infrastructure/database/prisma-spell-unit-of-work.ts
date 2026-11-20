import { Prisma } from "@/generated/prisma/client";

import type {
  SpellRepositories,
  SpellUnitOfWork,
} from "@/domain/ports/spell-unit-of-work";
import { SpellActiveActivationConflictError } from "@/domain/repositories/spell-activation-repository";
import { prisma } from "@/infrastructure/database/prisma";
import {
  DEFAULT_SERIALIZATION_RETRY,
  isRetryableSerializationFailure,
  withSerializationRetry,
  type RetryOptions,
} from "@/infrastructure/database/serialization-retry";
import { PrismaSpellActivationRepository } from "@/infrastructure/repositories/prisma-spell-activation-repository";
import { PrismaSpellLicenseEventRepository } from "@/infrastructure/repositories/prisma-spell-event-repository";
import { PrismaSpellInstallationRepository } from "@/infrastructure/repositories/prisma-spell-installation-repository";
import { PrismaSpellLicenseRepository } from "@/infrastructure/repositories/prisma-spell-license-repository";

const SPELL_TX_MAX_WAIT_MS = 10_000;
const SPELL_TX_TIMEOUT_MS = 15_000;

/**
 * Same shape as `PrismaBillingUnitOfWork` (SERIALIZABLE), plus a bounded retry
 * for serialization failures. Each attempt is a brand-new transaction over
 * fresh state, so `work` must be free of external side effects.
 */
export class PrismaSpellUnitOfWork implements SpellUnitOfWork {
  constructor(
    private readonly retry: RetryOptions = DEFAULT_SERIALIZATION_RETRY,
  ) {}

  async runInTransaction<T>(
    work: (repos: SpellRepositories) => Promise<T>,
  ): Promise<T> {
    try {
      return await withSerializationRetry(
        () =>
          prisma.$transaction(
            async (tx) =>
              work({
                licenseRepository: new PrismaSpellLicenseRepository(tx),
                installationRepository: new PrismaSpellInstallationRepository(tx),
                activationRepository: new PrismaSpellActivationRepository(tx),
                eventRepository: new PrismaSpellLicenseEventRepository(tx),
              }),
            {
              isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
              // Bursts of concurrent activations queue for pooled connections;
              // the 2s/5s defaults turn that into spurious failures.
              maxWait: SPELL_TX_MAX_WAIT_MS,
              timeout: SPELL_TX_TIMEOUT_MS,
            },
          ),
        this.retry,
      );
    } catch (error) {
      // Retries exhausted under contention: surface a typed, client-retryable
      // conflict instead of a raw driver error. State was rolled back.
      if (isRetryableSerializationFailure(error)) {
        throw new SpellActiveActivationConflictError();
      }
      throw error;
    }
  }
}

export const spellUnitOfWork = new PrismaSpellUnitOfWork();
