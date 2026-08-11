import type {
  CreateOrganizationWithFoundingOwnerInput,
  Organization,
  OrganizationMembership,
} from "@/domain/entities/organization";
import type { Tenant } from "@/domain/entities/tenant";
import {
  OrganizationMembershipStatus,
  OrganizationRole,
  OrganizationStatus,
  TenantKind,
  TenantStatus,
} from "@/domain/enums";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-error";
import type { OrganizationRepository } from "@/domain/repositories/organization-repository";
import {
  assertOrganizationCreateAuthorization,
  resolveOrganizationFoundingOwnerUserId,
} from "@/domain/services/organization-create-authz";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";
import {
  mapOrganization,
  mapOrganizationMembership,
  organizationMembershipSelect,
  organizationSelect,
} from "@/infrastructure/mappers/organization.mapper";
import { mapTenant, tenantSelect } from "@/infrastructure/mappers/tenant.mapper";
import { isFoundationOrgsV1Enabled } from "@/lib/feature-flags";

export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async findById(id: string): Promise<Organization | null> {
    const record = await this.db.organization.findFirst({
      where: { id, deletedAt: null },
      select: organizationSelect,
    });
    return record ? mapOrganization(record) : null;
  }

  async findByTenantId(tenantId: string): Promise<Organization | null> {
    const record = await this.db.organization.findFirst({
      where: { tenantId, deletedAt: null },
      select: organizationSelect,
    });
    return record ? mapOrganization(record) : null;
  }

  async createWithFoundingOwner(
    input: CreateOrganizationWithFoundingOwnerInput,
  ): Promise<{
    organization: Organization;
    membership: OrganizationMembership;
    tenant: Tenant;
  }> {
    if (!isFoundationOrgsV1Enabled()) {
      throw new ForbiddenError(
        "Organization foundation provisioning is disabled (TORE_FOUNDATION_ORGS_V1)",
      );
    }

    assertOrganizationCreateAuthorization(input.actorRole, input.type);

    const foundingOwnerUserId = resolveOrganizationFoundingOwnerUserId({
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      foundingOwnerUserId: input.foundingOwnerUserId,
    });

    const name = input.name.trim();
    if (!name) {
      throw new ValidationError("Organization name is required");
    }

    return this.withTransaction(async (db) => {
      const owner = await db.user.findFirst({
        where: { id: foundingOwnerUserId, deletedAt: null },
        select: { id: true },
      });
      if (!owner) {
        throw new NotFoundError("User", foundingOwnerUserId);
      }

      // Internal ORGANIZATION tenant insert — independent of TORE_FOUNDATION_TENANT_V1.
      const tenantRecord = await db.tenant.create({
        data: {
          kind: TenantKind.ORGANIZATION,
          status: TenantStatus.ACTIVE,
        },
        select: tenantSelect,
      });

      const organizationRecord = await db.organization.create({
        data: {
          type: input.type,
          name,
          status: OrganizationStatus.ACTIVE,
          tenantId: tenantRecord.id,
        },
        select: organizationSelect,
      });

      // Sole founding OWNER write path (no separate membership repository).
      const membershipRecord = await db.organizationMembership.create({
        data: {
          organizationId: organizationRecord.id,
          userId: foundingOwnerUserId,
          orgRole: OrganizationRole.OWNER,
          status: OrganizationMembershipStatus.ACTIVE,
        },
        select: organizationMembershipSelect,
      });

      return {
        organization: mapOrganization(organizationRecord),
        membership: mapOrganizationMembership(membershipRecord),
        tenant: mapTenant(tenantRecord),
      };
    });
  }

  private async withTransaction<T>(
    fn: (db: PrismaDbClient) => Promise<T>,
  ): Promise<T> {
    if (this.canStartTransaction(this.db)) {
      return this.db.$transaction(async (tx) => fn(tx));
    }
    return fn(this.db);
  }

  private canStartTransaction(db: PrismaDbClient): db is PrismaClient {
    return typeof (db as PrismaClient).$transaction === "function";
  }
}

export const organizationRepository = new PrismaOrganizationRepository();
