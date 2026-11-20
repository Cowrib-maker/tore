import type {
  CreateSpellLicenseInput,
  ListSpellLicensesInput,
  SpellLicenseRepository,
} from "@/domain/repositories/spell-license-repository";
import type { SpellLicense } from "@/domain/spell/entities";
import type {
  SpellLicenseSource,
  SpellLicenseStatus,
  SpellPlanCode,
  SpellProduct,
} from "@/domain/spell/enums";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";

type Row = {
  id: string;
  product: string;
  planCode: string;
  durationMonths: number;
  source: string;
  status: string;
  ownerUserId: string | null;
  codeHash: string;
  codeHashKeyId: string;
  codeCiphertext: Uint8Array;
  codeEncKeyVersion: string;
  codeHint: string;
  redeemBy: Date;
  startsAt: Date | null;
  expiresAt: Date | null;
  lastDeviceChangeAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
  issuedByUserId: string | null;
  purchaseInvoiceId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function mapSpellLicense(row: Row): SpellLicense {
  return {
    ...row,
    product: row.product as SpellProduct,
    planCode: row.planCode as SpellPlanCode,
    source: row.source as SpellLicenseSource,
    status: row.status as SpellLicenseStatus,
    codeCiphertext: new Uint8Array(row.codeCiphertext),
  };
}

export class PrismaSpellLicenseRepository implements SpellLicenseRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async create(input: CreateSpellLicenseInput): Promise<SpellLicense> {
    const row = await this.db.spellLicense.create({
      data: { ...input, codeCiphertext: Buffer.from(input.codeCiphertext) },
    });
    return mapSpellLicense(row);
  }

  async findById(id: string) {
    const row = await this.db.spellLicense.findUnique({ where: { id } });
    return row ? mapSpellLicense(row) : null;
  }

  async findByPurchaseInvoiceId(invoiceId: string) {
    const row = await this.db.spellLicense.findUnique({ where: { purchaseInvoiceId: invoiceId } });
    return row ? mapSpellLicense(row) : null;
  }

  async findByCodeHashes(hashes: string[]) {
    if (hashes.length === 0) return null;
    const row = await this.db.spellLicense.findFirst({
      where: { codeHash: { in: hashes } },
    });
    return row ? mapSpellLicense(row) : null;
  }

  async listByOwner(ownerUserId: string) {
    const rows = await this.db.spellLicense.findMany({
      where: { ownerUserId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapSpellLicense);
  }

  async list(input: ListSpellLicensesInput) {
    const where = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.planCode ? { planCode: input.planCode } : {}),
      ...(input.source ? { source: input.source } : {}),
      ...(input.ownerUserId ? { ownerUserId: input.ownerUserId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.spellLicense.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: input.limit,
        skip: input.offset,
      }),
      this.db.spellLicense.count({ where }),
    ]);
    return { items: rows.map(mapSpellLicense), total };
  }

  async startTerm(id: string, startsAt: Date, expiresAt: Date) {
    const result = await this.db.spellLicense.updateMany({
      where: { id, startsAt: null },
      data: { startsAt, expiresAt },
    });
    return result.count === 1;
  }

  async setLastDeviceChangeAt(id: string, at: Date | null) {
    await this.db.spellLicense.update({
      where: { id },
      data: { lastDeviceChangeAt: at },
    });
  }

  async revoke(id: string, at: Date, reason: string) {
    const result = await this.db.spellLicense.updateMany({
      where: { id, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: at, revokedReason: reason },
    });
    return result.count === 1;
  }

  async updateCodeCiphertext(
    id: string,
    ciphertext: Uint8Array,
    keyVersion: string,
  ) {
    await this.db.spellLicense.update({
      where: { id },
      data: {
        codeCiphertext: Buffer.from(ciphertext),
        codeEncKeyVersion: keyVersion,
      },
    });
  }
}

export const spellLicenseRepository = new PrismaSpellLicenseRepository();
