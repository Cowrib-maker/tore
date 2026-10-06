import type {
  SpellInstallationRepository,
  UpsertSpellInstallationInput,
} from "@/domain/repositories/spell-installation-repository";
import type { SpellInstallation } from "@/domain/spell/entities";
import type { SpellPlatform } from "@/domain/spell/enums";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";

type Row = Omit<SpellInstallation, "platform"> & { platform: string };

function map(row: Row): SpellInstallation {
  return { ...row, platform: row.platform as SpellPlatform };
}

export class PrismaSpellInstallationRepository
  implements SpellInstallationRepository
{
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async findById(id: string) {
    const row = await this.db.spellInstallation.findUnique({ where: { id } });
    return row ? map(row) : null;
  }

  async findByThumbprint(keyThumbprint: string) {
    const row = await this.db.spellInstallation.findUnique({
      where: { keyThumbprint },
    });
    return row ? map(row) : null;
  }

  async upsert(input: UpsertSpellInstallationInput) {
    const row = await this.db.spellInstallation.upsert({
      where: { keyThumbprint: input.keyThumbprint },
      create: {
        keyThumbprint: input.keyThumbprint,
        publicKey: input.publicKey,
        platform: input.platform,
        appVersion: input.appVersion,
        machineHintHash: input.machineHintHash,
        firstSeenAt: input.now,
        lastSeenAt: input.now,
      },
      update: {
        platform: input.platform,
        appVersion: input.appVersion,
        machineHintHash: input.machineHintHash,
        lastSeenAt: input.now,
      },
    });
    return map(row);
  }

  async touch(id: string, now: Date) {
    await this.db.spellInstallation.update({
      where: { id },
      data: { lastSeenAt: now },
    });
  }

  async revoke(id: string, at: Date) {
    await this.db.spellInstallation.update({
      where: { id },
      data: { revokedAt: at },
    });
  }
}

export const spellInstallationRepository =
  new PrismaSpellInstallationRepository();
