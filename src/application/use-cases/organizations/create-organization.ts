import type { Organization, OrganizationMembership } from "@/domain/entities/organization";
import type { Tenant } from "@/domain/entities/tenant";
import type { OrganizationType, UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import type { UnitOfWork } from "@/domain/ports/unit-of-work";
import { isFoundationOrgsV1Enabled } from "@/lib/feature-flags";

export type CreateOrganizationInput = {
  actorUserId: string;
  actorRole: UserRole;
  type: OrganizationType;
  name: string;
  /**
   * Admin-only: designate founding OWNER as another existing User.
   * Non-admins must omit; OWNER is always the actor.
   */
  foundingOwnerUserId?: string;
};

export type CreateOrganizationResult = {
  organization: Organization;
  membership: OrganizationMembership;
  tenant: Tenant;
};

/**
 * EPIC 02 · Sprint 2.3 Wave 1 — create Organization + ORGANIZATION Tenant + founding OWNER.
 * Authz matrix is enforced inside OrganizationRepository (no bypass).
 * Does not touch marketplace, bookings, LawyerProfile, or requireActor.
 */
export async function createOrganizationUseCase(
  input: CreateOrganizationInput,
  deps: {
    unitOfWork: UnitOfWork;
  },
): Promise<CreateOrganizationResult> {
  if (!isFoundationOrgsV1Enabled()) {
    throw new ForbiddenError(
      "Organization foundation provisioning is disabled (TORE_FOUNDATION_ORGS_V1)",
    );
  }

  return deps.unitOfWork.runInTransaction(async (repos) => {
    return repos.organizationRepository.createWithFoundingOwner({
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      type: input.type,
      name: input.name,
      foundingOwnerUserId: input.foundingOwnerUserId,
    });
  });
}

export {
  assertOrganizationCreateAuthorization as assertCreateAuthorization,
} from "@/domain/services/organization-create-authz";
