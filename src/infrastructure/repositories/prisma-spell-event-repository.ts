import type {
  AppendSpellEventInput,
  SpellLicenseEventRepository,
} from "@/domain/repositories/spell-event-repository";
import type { SpellLicenseEvent } from "@/domain/spell/entities";
import type { SpellActorType, SpellEventType } from "@/domain/spell/enums";
import type { Prisma } from "@/generated/prisma/client";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";

type Row = {
  id: string;
  licenseId: string;
  activationId: string | null;
  type: string;
  actorType: string;
  actorUserId: string | null;
  ipHash: string | null;
  metadata: unknown;
  createdAt: Date;
};

function map(row: Row): SpellLicenseEvent {
  return {
    ...row,
    type: row.type as SpellEventType,
    actorType: row.actorType as SpellActorType,
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null,
  };
}

export class PrismaSpellLicenseEventRepository
  implements SpellLicenseEventRepository
{
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async append(input: AppendSpellEventInput) {
    const row = await this.db.spellLicenseEvent.create({
      data: {
        licenseId: input.licenseId,
        activationId: input.activationId ?? null,
        type: input.type,
        actorType: input.actorType,
        actorUserId: input.actorUserId ?? null,
        ipHash: input.ipHash ?? null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        createdAt: input.createdAt,
      },
    });
    return map(row);
  }

  async listByLicenseId(licenseId: string, limit = 200) {
    const rows = await this.db.spellLicenseEvent.findMany({
      where: { licenseId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    return rows.map(map);
  }
}

export const spellLicenseEventRepository = new PrismaSpellLicenseEventRepository();
