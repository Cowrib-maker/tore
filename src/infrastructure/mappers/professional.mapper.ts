import type { Professional } from "@/domain/entities/professional";
import type { LawyerProfile } from "@/domain/entities/profile";
import { ProfessionalType } from "@/domain/enums";

/**
 * Strategy B alias: map an existing LawyerProfile to Professional(LAWYER).
 * Returns null when missing or soft-deleted. Never creates or mutates profiles.
 */
export function mapLawyerProfileToProfessional(
  profile: LawyerProfile | null | undefined,
): Professional | null {
  if (!profile || profile.deletedAt != null) {
    return null;
  }

  return {
    id: profile.id,
    userId: profile.userId,
    type: ProfessionalType.LAWYER,
  };
}
