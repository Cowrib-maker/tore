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

/**
 * EPIC 02 · Sprint 2.3 Wave 1 — Organization foundation product flag.
 * Must be exactly "1" to enable. Default: OFF (missing / any other value).
 * Independent of Tenant and Professional flags.
 */
export const FOUNDATION_ORGS_V1_FLAG = "TORE_FOUNDATION_ORGS_V1";

export function isFoundationOrgsV1Enabled(): boolean {
  return allowFlag(FOUNDATION_ORGS_V1_FLAG);
}

/**
 * EPIC 02 · Wave 2 Step 3 — Active Context product flag.
 * Must be exactly "1" to enable. Default: OFF.
 * Independent of Tenant / Orgs flags; personal context still needs a linked
 * personalTenantId, and org context needs ACTIVE membership.
 */
export const FOUNDATION_ACTIVE_CONTEXT_V1_FLAG =
  "TORE_FOUNDATION_ACTIVE_CONTEXT_V1";

export function isFoundationActiveContextV1Enabled(): boolean {
  return allowFlag(FOUNDATION_ACTIVE_CONTEXT_V1_FLAG);
}

/**
 * Admin developer console (`/admin/dev`): impersonation, bulk verification,
 * and lifecycle toggles. Hard-disabled in production even if the env flag is set.
 * Must be exactly "1" AND NODE_ENV !== "production".
 */
export const ADMIN_DEVTOOLS_V1_FLAG = "TORE_ADMIN_DEVTOOLS_V1";

export function isAdminDevtoolsEnabled(): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return allowFlag(ADMIN_DEVTOOLS_V1_FLAG);
}

/**
 * Adversarial-orthography-evaluation milestone — controlled activation of
 * the generated (corpus-derived) legal vocabulary layer in
 * src/domain/mongolian-orthography/dictionary.ts. Must be exactly "1" to
 * enable. Default: OFF (missing / any other value) — matches every other
 * flag in this file, and matters more here than most: the hand-curated
 * dictionary alone remains authoritative until this is explicitly turned
 * on, and turning it back off (then restarting the process) is the
 * complete, immediate kill switch — no migration, no cache to invalidate,
 * no manual cleanup (see generated-vocabulary-activation.ts).
 *
 * Server-only by construction, not by convention alone: nothing in this
 * flag's own code path touches `NEXT_PUBLIC_`-prefixed env, and the only
 * caller (generated-vocabulary-activation.ts) is itself imported solely
 * from server-only application code (the paid orthography-check use
 * case), never from a "use client" component — so this can never be
 * read, let alone set, from a browser request.
 */
export const GENERATED_LEGAL_VOCABULARY_V1_FLAG = "TORE_GENERATED_LEGAL_VOCABULARY_V1";

export function isGeneratedLegalVocabularyEnabled(): boolean {
  return allowFlag(GENERATED_LEGAL_VOCABULARY_V1_FLAG);
}
