import type {
  CreateOrganizationWithFoundingOwnerInput,
  Organization,
  OrganizationMembership,
} from "@/domain/entities/organization";
import type { Tenant } from "@/domain/entities/tenant";

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
}
