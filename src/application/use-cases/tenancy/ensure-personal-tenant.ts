import type { Tenant } from "@/domain/entities/tenant";
import type { TenantRepository } from "@/domain/repositories/tenant-repository";
import { isFoundationTenantV1Enabled } from "@/lib/feature-flags";

export type EnsurePersonalTenantResult =
  | {
      ok: true;
      skipped: false;
      tenant: Tenant;
      created: boolean;
    }
  | {
      ok: true;
      skipped: true;
      reason: "flag_off";
    };

/**
 * Provision a personal Tenant for a user (ADR-001).
 * No-ops when TORE_FOUNDATION_TENANT_V1 is off unless `force` is true (ops backfill).
 * Does not alter bookings, marketplace, or profiles.
 */
export async function ensurePersonalTenantForUserUseCase(
  userId: string,
  deps: { tenantRepository: TenantRepository },
  options: { force?: boolean } = {},
): Promise<EnsurePersonalTenantResult> {
  if (!options.force && !isFoundationTenantV1Enabled()) {
    return { ok: true, skipped: true, reason: "flag_off" };
  }

  const result = await deps.tenantRepository.ensurePersonalTenantForUser(
    userId,
    { force: options.force === true },
  );
  return {
    ok: true,
    skipped: false,
    tenant: result.tenant,
    created: result.created,
  };
}

/**
 * Idempotent batch backfill for users missing personalTenantId.
 * Intended for CLI / ops. Use `force: true` when product flag is still off.
 * Fails if any users remain unprocessed after maxBatches.
 */
export async function backfillPersonalTenantsUseCase(
  deps: { tenantRepository: TenantRepository },
  options: { force?: boolean; batchSize?: number; maxBatches?: number } = {},
): Promise<{
  processed: number;
  created: number;
  skippedFlag: boolean;
}> {
  if (!options.force && !isFoundationTenantV1Enabled()) {
    return { processed: 0, created: 0, skippedFlag: true };
  }

  const force = options.force === true;
  const batchSize = options.batchSize ?? 100;
  const maxBatches = options.maxBatches ?? 1000;
  let processed = 0;
  let created = 0;

  for (let i = 0; i < maxBatches; i += 1) {
    const ids = await deps.tenantRepository.listUserIdsMissingPersonalTenant(
      batchSize,
    );
    if (ids.length === 0) break;

    for (const userId of ids) {
      const result = await deps.tenantRepository.ensurePersonalTenantForUser(
        userId,
        { force },
      );
      processed += 1;
      if (result.created) created += 1;
    }

    if (ids.length < batchSize) break;
  }

  const remaining =
    await deps.tenantRepository.listUserIdsMissingPersonalTenant(1);
  if (remaining.length > 0) {
    throw new Error(
      `Backfill incomplete: users still missing personalTenantId after maxBatches=${maxBatches} (processed=${processed}). Increase maxBatches or re-run.`,
    );
  }

  return { processed, created, skippedFlag: false };
}
