import type { ActorContext } from "@/application/common/actor-context";
import type { OrganizationMembershipView } from "@/domain/repositories/organization-repository";
import type { OrganizationRepository } from "@/domain/repositories/organization-repository";
import { ForbiddenError } from "@/domain/errors/domain-error";
import { requireActiveOrganizationMembership } from "@/domain/services/organization-membership-authz";
import { isFoundationOrgsV1Enabled } from "@/lib/feature-flags";

/**
 * Membership-scoped organization overview.
 * Non-members receive NotFound (IDOR-safe — no existence leak).
 */
export async function getMyOrganizationOverviewUseCase(
  actor: ActorContext,
  organizationId: string,
  deps: { organizationRepository: OrganizationRepository },
): Promise<OrganizationMembershipView> {
  if (!isFoundationOrgsV1Enabled()) {
    throw new ForbiddenError(
      "Organization foundation provisioning is disabled (TORE_FOUNDATION_ORGS_V1)",
    );
  }

  const view = await deps.organizationRepository.findActiveMembershipForUser(
    organizationId,
    actor.userId,
  );
  return requireActiveOrganizationMembership(view, organizationId);
}
