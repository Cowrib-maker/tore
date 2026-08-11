import type { Tenant } from "@/domain/entities/tenant";

export type TenantProvisioningOptions = {
  /**
   * Ops backfill may proceed while TORE_FOUNDATION_TENANT_V1 is still OFF.
   * Product paths must leave this unset / false.
   */
  force?: boolean;
};

export interface TenantRepository {
  findById(id: string): Promise<Tenant | null>;
  /**
   * Create an INDIVIDUAL tenant and link it to the user when the user has no
   * personalTenantId yet. Idempotent if already linked.
   * Flag-gated unless `force` is true.
   */
  ensurePersonalTenantForUser(
    userId: string,
    options?: TenantProvisioningOptions,
  ): Promise<{
    tenant: Tenant;
    created: boolean;
  }>;
  listUserIdsMissingPersonalTenant(limit: number): Promise<string[]>;
}
