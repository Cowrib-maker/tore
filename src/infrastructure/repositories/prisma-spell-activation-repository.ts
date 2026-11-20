import {
  SpellActiveActivationConflictError,
  type CreateSpellActivationInput,
  type EndSpellActivationInput,
  type SpellActivationRepository,
} from "@/domain/repositories/spell-activation-repository";
import type { SpellActivation } from "@/domain/spell/entities";
import type {
  SpellActivationEndReason,
  SpellActivationStatus,
} from "@/domain/spell/enums";
import { isPrismaUniqueViolation } from "@/infrastructure/database/prisma-errors";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";

type Row = Omit<SpellActivation, "status" | "endReason"> & {
  status: string;
  endReason: string | null;
};

function map(row: Row): SpellActivation {
  return {
    ...row,
    status: row.status as SpellActivationStatus,
    endReason: row.endReason as SpellActivationEndReason | null,
  };
}

export class PrismaSpellActivationRepository
  implements SpellActivationRepository
{
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async findById(id: string) {
    const row = await this.db.spellActivation.findUnique({ where: { id } });
    return row ? map(row) : null;
  }

  async findActiveByLicenseId(licenseId: string) {
    const row = await this.db.spellActivation.findFirst({
      where: { licenseId, status: "ACTIVE" },
    });
    return row ? map(row) : null;
  }

  async findLatestByLicenseId(licenseId: string) {
    const row = await this.db.spellActivation.findFirst({
      where: { licenseId },
      orderBy: [{ activatedAt: "desc" }, { createdAt: "desc" }],
    });
    return row ? map(row) : null;
  }

  async listByLicenseId(licenseId: string) {
    const rows = await this.db.spellActivation.findMany({
      where: { licenseId },
      orderBy: [{ activatedAt: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(map);
  }

  async listActiveByInstallationId(installationId: string) {
    const rows = await this.db.spellActivation.findMany({
      where: { installationId, status: "ACTIVE" },
    });
    return rows.map(map);
  }

  async create(input: CreateSpellActivationInput) {
    try {
      const row = await this.db.spellActivation.create({
        data: {
          licenseId: input.licenseId,
          installationId: input.installationId,
          userId: input.userId,
          status: "ACTIVE",
          activatedAt: input.activatedAt,
          lastValidatedAt: input.activatedAt,
          transferredFromActivationId: input.transferredFromActivationId,
          lastTokenJti: input.lastTokenJti,
        },
      });
      return map(row);
    } catch (error) {
      // Only the partial unique index can be violated by this insert.
      if (isPrismaUniqueViolation(error)) {
        throw new SpellActiveActivationConflictError();
      }
      throw error;
    }
  }

  async end(input: EndSpellActivationInput) {
    const result = await this.db.spellActivation.updateMany({
      where: { id: input.id, status: "ACTIVE" },
      data: {
        status: input.status,
        endReason: input.reason,
        deactivatedAt: input.at,
        ...(input.supersededByActivationId !== undefined
          ? { supersededByActivationId: input.supersededByActivationId }
          : {}),
      },
    });
    return result.count === 1;
  }

  async recordValidation(id: string, at: Date, tokenJti: string) {
    await this.db.spellActivation.update({
      where: { id },
      data: { lastValidatedAt: at, lastTokenJti: tokenJti },
    });
  }

  async setSuperseded(id: string, supersededByActivationId: string) {
    await this.db.spellActivation.update({
      where: { id },
      data: { supersededByActivationId },
    });
  }
}

export const spellActivationRepository = new PrismaSpellActivationRepository();
