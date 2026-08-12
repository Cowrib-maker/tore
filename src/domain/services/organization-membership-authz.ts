import type {
  Organization,
  OrganizationMembership,
} from "@/domain/entities/organization";
import { OrganizationMembershipStatus, OrganizationRole } from "@/domain/enums";
import { NotFoundError } from "@/domain/errors/domain-error";

/**
 * Membership-scoped organization view for product surfaces and future Active Context.
 */
export type OrganizationMembershipAuthzView = {
  organization: Organization;
  membership: OrganizationMembership;
};

/**
 * Assert the actor has an ACTIVE membership on the organization.
 * Uses NOT_FOUND (not FORBIDDEN) to avoid leaking organization existence (IDOR-safe).
 */
export function requireActiveOrganizationMembership(
  view: OrganizationMembershipAuthzView | null,
  organizationId: string,
): OrganizationMembershipAuthzView {
  if (!view) {
    throw new NotFoundError("Organization", organizationId);
  }
  if (view.membership.status !== OrganizationMembershipStatus.ACTIVE) {
    throw new NotFoundError("Organization", organizationId);
  }
  if (view.organization.deletedAt) {
    throw new NotFoundError("Organization", organizationId);
  }
  return view;
}

/** Minimal OWNER check for future org mutations (Wave 1.5 foundation). */
export function assertOrganizationOwner(
  membership: OrganizationMembership,
): void {
  if (membership.orgRole !== OrganizationRole.OWNER) {
    throw new NotFoundError("Organization", membership.organizationId);
  }
}
