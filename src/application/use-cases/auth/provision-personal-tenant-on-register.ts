import { ensurePersonalTenantForUserUseCase } from "@/application/use-cases/tenancy/ensure-personal-tenant";
import type { User } from "@/domain/entities/user";
import type { TenantRepository } from "@/domain/repositories/tenant-repository";

/**
 * Flag-gated personal tenant provisioning for registration (ADR-001).
 *
 * Must run **inside** the registration UnitOfWork transaction so a failed
 * ensure rolls back the new user (no orphan users / orphan tenants).
 *
 * - TORE_FOUNDATION_TENANT_V1 off → returns `user` unchanged (no DB tenant writes).
 * - Flag on → ensures an INDIVIDUAL tenant and links `personalTenantId`.
 * - Errors propagate so registration is not reported successful.
 */
export async function provisionPersonalTenantOnRegister(
  user: User,
  tenantRepository: TenantRepository,
): Promise<User> {
  const result = await ensurePersonalTenantForUserUseCase(user.id, {
    tenantRepository,
  });

  if (result.skipped) {
    return user;
  }

  return {
    ...user,
    personalTenantId: result.tenant.id,
  };
}
