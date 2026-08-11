import type { PrismaClient } from "@/generated/prisma/client";
import type { Tenant } from "@/domain/entities/tenant";
import { TenantKind, TenantStatus } from "@/domain/enums";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/domain/errors/domain-error";
import type {
  TenantProvisioningOptions,
  TenantRepository,
} from "@/domain/repositories/tenant-repository";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";
import {
  mapTenant,
  tenantSelect,
} from "@/infrastructure/mappers/tenant.mapper";
import { isFoundationTenantV1Enabled } from "@/lib/feature-flags";

export class PrismaTenantRepository implements TenantRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async findById(id: string): Promise<Tenant | null> {
    const record = await this.db.tenant.findFirst({
      where: { id, deletedAt: null },
      select: tenantSelect,
    });
    return record ? mapTenant(record) : null;
  }

  async ensurePersonalTenantForUser(
    userId: string,
    options: TenantProvisioningOptions = {},
  ): Promise<{
    tenant: Tenant;
    created: boolean;
  }> {
    this.assertProvisioningAllowed(options.force);

    return this.withTransaction(async (db) => {
      const user = await db.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { id: true, personalTenantId: true },
      });
      if (!user) {
        throw new NotFoundError("User", userId);
      }

      if (user.personalTenantId) {
        const existing = await db.tenant.findFirst({
          where: { id: user.personalTenantId, deletedAt: null },
          select: tenantSelect,
        });
        if (existing) {
          return { tenant: mapTenant(existing), created: false };
        }
      }

      const created = await db.tenant.create({
        data: {
          kind: TenantKind.INDIVIDUAL,
          status: TenantStatus.ACTIVE,
        },
        select: tenantSelect,
      });

      // Conditional update prevents concurrent dual-link races; loser deletes orphan.
      const linked = await db.user.updateMany({
        where: {
          id: userId,
          deletedAt: null,
          ...(user.personalTenantId
            ? {
                OR: [
                  { personalTenantId: null },
                  { personalTenantId: user.personalTenantId },
                ],
              }
            : { personalTenantId: null }),
        },
        data: { personalTenantId: created.id },
      });

      if (linked.count === 0) {
        await db.tenant.delete({ where: { id: created.id } });
        const again = await db.user.findFirst({
          where: { id: userId, deletedAt: null },
          select: { personalTenantId: true },
        });
        if (!again?.personalTenantId) {
          throw new ConflictError(
            "Failed to link personal tenant after concurrent ensure",
          );
        }
        const winner = await db.tenant.findFirst({
          where: { id: again.personalTenantId, deletedAt: null },
          select: tenantSelect,
        });
        if (!winner) {
          throw new ConflictError(
            "Personal tenant link race unresolved — linked id missing",
          );
        }
        return { tenant: mapTenant(winner), created: false };
      }

      return { tenant: mapTenant(created), created: true };
    });
  }

  async listUserIdsMissingPersonalTenant(limit: number): Promise<string[]> {
    const rows = await this.db.user.findMany({
      where: { deletedAt: null, personalTenantId: null },
      select: { id: true },
      take: Math.max(1, Math.min(limit, 1000)),
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => r.id);
  }

  private assertProvisioningAllowed(force?: boolean): void {
    if (!force && !isFoundationTenantV1Enabled()) {
      throw new ForbiddenError(
        "Foundation tenant provisioning is disabled (TORE_FOUNDATION_TENANT_V1)",
      );
    }
  }

  /**
   * Prefer a real interactive transaction; if already inside one (UoW), reuse it.
   */
  private async withTransaction<T>(
    fn: (db: PrismaDbClient) => Promise<T>,
  ): Promise<T> {
    if (this.canStartTransaction(this.db)) {
      return this.db.$transaction(async (tx) => fn(tx));
    }
    return fn(this.db);
  }

  private canStartTransaction(
    db: PrismaDbClient,
  ): db is PrismaClient {
    return typeof (db as PrismaClient).$transaction === "function";
  }
}

export const tenantRepository = new PrismaTenantRepository();
