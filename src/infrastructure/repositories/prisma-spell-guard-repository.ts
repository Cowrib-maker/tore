import type {
  RecordSpellAttemptInput,
  SpellAttemptRepository,
  SpellNonceRepository,
} from "@/domain/repositories/spell-guard-repository";
import type { SpellAttempt } from "@/domain/spell/entities";
import type { SpellAttemptKind, SpellAttemptOutcome } from "@/domain/spell/enums";
import { isPrismaUniqueViolation } from "@/infrastructure/database/prisma-errors";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";

export class PrismaSpellAttemptRepository implements SpellAttemptRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async record(input: RecordSpellAttemptInput): Promise<SpellAttempt> {
    const row = await this.db.spellAttempt.create({
      data: {
        kind: input.kind,
        outcome: input.outcome,
        ipHash: input.ipHash ?? null,
        installationThumbprint: input.installationThumbprint ?? null,
        licenseId: input.licenseId ?? null,
        createdAt: input.at,
      },
    });
    return {
      ...row,
      kind: row.kind as SpellAttemptKind,
      outcome: row.outcome as SpellAttemptOutcome,
    };
  }

  async countFailedCodeAttempts(input: {
    ipHash?: string | null;
    installationThumbprint?: string | null;
    since: Date;
  }) {
    const base = {
      kind: "ACTIVATE" as const,
      outcome: "INVALID_CODE" as const,
      createdAt: { gte: input.since },
    };
    const [byIp, byInstallation] = await Promise.all([
      input.ipHash
        ? this.db.spellAttempt.count({ where: { ...base, ipHash: input.ipHash } })
        : 0,
      input.installationThumbprint
        ? this.db.spellAttempt.count({
            where: { ...base, installationThumbprint: input.installationThumbprint },
          })
        : 0,
    ]);
    return { byIp, byInstallation };
  }

  async deleteOlderThan(cutoff: Date) {
    const result = await this.db.spellAttempt.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return result.count;
  }
}

export class PrismaSpellNonceRepository implements SpellNonceRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async tryConsume(input: {
    installationThumbprint: string;
    nonce: string;
    expiresAt: Date;
  }) {
    try {
      await this.db.spellRequestNonce.create({ data: input });
      return true;
    } catch (error) {
      if (isPrismaUniqueViolation(error)) return false;
      throw error;
    }
  }

  async deleteExpired(now: Date) {
    const result = await this.db.spellRequestNonce.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return result.count;
  }
}

export const spellAttemptRepository = new PrismaSpellAttemptRepository();
export const spellNonceRepository = new PrismaSpellNonceRepository();
