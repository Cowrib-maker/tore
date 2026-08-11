import { allowFlag } from "@/lib/env-guards";

/**
 * EPIC 02 · Sprint 2.2 Wave 1 — Tenant foundation product flag.
 * Must be exactly "1" to enable. Default: OFF (missing / any other value).
 */
export const FOUNDATION_TENANT_V1_FLAG = "TORE_FOUNDATION_TENANT_V1";

export function isFoundationTenantV1Enabled(): boolean {
  return allowFlag(FOUNDATION_TENANT_V1_FLAG);
}

/**
 * EPIC 02 · Sprint 2.2 Wave 2 — Professional foundation product flag.
 * Must be exactly "1" to enable. Default: OFF (missing / any other value).
 * Wave 2 ships no product callers; flag prepares future adoption waves.
 */
export const FOUNDATION_PROFESSIONAL_V1_FLAG = "TORE_FOUNDATION_PROFESSIONAL_V1";

export function isFoundationProfessionalV1Enabled(): boolean {
  return allowFlag(FOUNDATION_PROFESSIONAL_V1_FLAG);
}
