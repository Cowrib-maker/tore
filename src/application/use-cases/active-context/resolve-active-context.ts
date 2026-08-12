import type { ActorContext, ActiveContext } from "@/application/common/actor-context";
import { ActiveContextType, TenantKind, TenantStatus } from "@/domain/enums";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-error";
import type { OrganizationRepository } from "@/domain/repositories/organization-repository";
import type { TenantRepository } from "@/domain/repositories/tenant-repository";
import { requireActiveOrganizationMembership } from "@/domain/services/organization-membership-authz";
import { isFoundationActiveContextV1Enabled } from "@/lib/feature-flags";

export type ActiveContextDeps = {
  tenantRepository: TenantRepository;
  organizationRepository: OrganizationRepository;
};

function assertActiveContextEnabled(): void {
  if (!isFoundationActiveContextV1Enabled()) {
    throw new ForbiddenError(
      "Active Context is disabled (TORE_FOUNDATION_ACTIVE_CONTEXT_V1)",
    );
  }
}

function assertUsableTenant(
  tenant: { id: string; kind: TenantKind; status: TenantStatus; deletedAt: Date | null },
  expectedKind: TenantKind,
): void {
  if (tenant.deletedAt) {
    throw new NotFoundError("Tenant", tenant.id);
  }
  if (tenant.status !== TenantStatus.ACTIVE) {
    throw new ForbiddenError("Tenant is not active");
  }
  if (tenant.kind !== expectedKind) {
    throw new ForbiddenError("Tenant kind mismatch for Active Context");
  }
}

/**
 * Resolve PERSONAL Active Context for a trusted actor.
 * Does not accept client-supplied tenantId.
 */
export async function resolvePersonalActiveContextUseCase(
  actor: ActorContext,
  deps: ActiveContextDeps,
): Promise<ActiveContext> {
  assertActiveContextEnabled();

  const tenant = await deps.tenantRepository.findPersonalTenantForUser(
    actor.userId,
  );
  if (!tenant) {
    throw new ValidationError(
      "Personal tenant is not provisioned for this user",
    );
  }
  assertUsableTenant(tenant, TenantKind.INDIVIDUAL);

  return {
    userId: actor.userId,
    role: actor.role,
    contextType: ActiveContextType.PERSONAL,
    tenantId: tenant.id,
  };
}

/**
 * Resolve ORGANIZATION Active Context for a trusted actor + organizationId.
 * Membership and organization tenant are loaded server-side (IDOR-safe NotFound).
 * Client-supplied tenantId / membershipId are ignored.
 */
export async function resolveOrganizationActiveContextUseCase(
  actor: ActorContext,
  organizationId: string,
  deps: ActiveContextDeps,
): Promise<ActiveContext> {
  assertActiveContextEnabled();

  const view = await deps.organizationRepository.findActiveMembershipForUser(
    organizationId,
    actor.userId,
  );
  const membershipView = requireActiveOrganizationMembership(
    view,
    organizationId,
  );

  const orgTenant = await deps.tenantRepository.findById(
    membershipView.organization.tenantId,
  );
  if (!orgTenant) {
    throw new NotFoundError("Organization", organizationId);
  }
  assertUsableTenant(orgTenant, TenantKind.ORGANIZATION);

  // Defense: organization.tenantId must equal resolved tenant.id
  if (orgTenant.id !== membershipView.organization.tenantId) {
    throw new NotFoundError("Organization", organizationId);
  }

  return {
    userId: actor.userId,
    role: actor.role,
    contextType: ActiveContextType.ORGANIZATION,
    tenantId: orgTenant.id,
    organizationId: membershipView.organization.id,
    membershipId: membershipView.membership.id,
    orgRole: membershipView.membership.orgRole,
  };
}
