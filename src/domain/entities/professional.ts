import type { ProfessionalType } from "@/domain/enums";

/**
 * EPIC 02 · Sprint 2.2 Wave 2 — thin Professional domain view (ADR-002 / ADR-005 Strategy B).
 * Alias over LawyerProfile: `id` and `userId` are the LawyerProfile identifiers.
 * Not a persistence aggregate; Wave 2 never creates profiles.
 */
export interface Professional {
  id: string;
  userId: string;
  type: ProfessionalType.LAWYER;
}
