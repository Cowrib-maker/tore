import { UserRole } from "@/domain/enums";

/**
 * Server-derived product capability. Never taken from client JSON `mode`.
 *
 * CITIZEN — TORE Chat (guest, client, admin-as-user, unverified callers)
 * LAWYER  — TORE Legal AI (authenticated UserRole.LAWYER only)
 */
export const LegalAiCapability = {
  CITIZEN: "CITIZEN",
  LAWYER: "LAWYER",
} as const;

export type LegalAiCapability =
  (typeof LegalAiCapability)[keyof typeof LegalAiCapability];

/**
 * Authorization for the professional product. Client-supplied mode/role
 * strings are ignored — only the authenticated session role counts.
 */
export function resolveLegalAiCapability(input: {
  actorRole?: UserRole | string | null;
}): LegalAiCapability {
  const role = typeof input.actorRole === "string" ? input.actorRole.trim() : "";
  if (role === UserRole.LAWYER) {
    return LegalAiCapability.LAWYER;
  }
  return LegalAiCapability.CITIZEN;
}

export function isLawyerCapability(
  capability: LegalAiCapability,
): boolean {
  return capability === LegalAiCapability.LAWYER;
}
