import type { ActorContext } from "@/application/common/actor-context";
import type { OrganizationMembershipView } from "@/domain/repositories/organization-repository";
import type { OrganizationRepository } from "@/domain/repositories/organization-repository";
import { ForbiddenError } from "@/domain/errors/domain-error";
import { isFoundationOrgsV1Enabled } from "@/lib/feature-flags";

/**
 * List organizations where the actor has an ACTIVE membership.
 * Never returns organizations the actor does not belong to.
 */
export async function listMyOrganizationsUseCase(
  actor: ActorContext,
  deps: { organizationRepository: OrganizationRepository },
): Promise<OrganizationMembershipView[]> {
  if (!isFoundationOrgsV1Enabled()) {
    throw new ForbiddenError(
      "Organization foundation provisioning is disabled (TORE_FOUNDATION_ORGS_V1)",
    );
  }

  return deps.organizationRepository.listActiveMembershipsForUser(actor.userId);
}
