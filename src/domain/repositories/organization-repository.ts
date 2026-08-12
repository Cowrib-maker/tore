import type {
  CreateOrganizationWithFoundingOwnerInput,
  Organization,
  OrganizationMembership,
} from "@/domain/entities/organization";
import type { Tenant } from "@/domain/entities/tenant";

export type OrganizationMembershipView = {
  organization: Organization;
  membership: OrganizationMembership;
};

export interface OrganizationRepository {
  findById(id: string): Promise<Organization | null>;
  findByTenantId(tenantId: string): Promise<Organization | null>;
  /**
   * Sole founding-OWNER create path (Strategy B Wave 1 remediations).
   * Enforces TORE_FOUNDATION_ORGS_V1 + create authorization matrix.
   * Independent of TORE_FOUNDATION_TENANT_V1.
   */
  createWithFoundingOwner(
    input: CreateOrganizationWithFoundingOwnerInput,
  ): Promise<{
    organization: Organization;
    membership: OrganizationMembership;
    tenant: Tenant;
  }>;
  /**
   * Organizations where the user has an ACTIVE membership.
   * Never returns orgs the user does not belong to.
   */
  listActiveMembershipsForUser(
    userId: string,
  ): Promise<OrganizationMembershipView[]>;
  /**
   * Membership-scoped load. Returns null when the user is not an ACTIVE member
   * (callers should map null → NotFound for IDOR safety).
   */
  findActiveMembershipForUser(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembershipView | null>;
}
