import type { UpdateLawyerProfileFormInput } from "@/application/validators/profile.schema";
import type { LawyerProfile } from "@/domain/entities/profile";
import { AuditAction } from "@/domain/enums";
import {
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-error";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type { LawyerProfileRepository } from "@/domain/repositories/profile-repository";
import { isLawyerVerified } from "@/domain/services/lawyer-eligibility";

export type UpdateLawyerProfileDeps = {
  lawyerProfileRepository: LawyerProfileRepository;
  auditLogRepository: AuditLogRepository;
};

export async function updateLawyerProfileUseCase(
  userId: string,
  input: UpdateLawyerProfileFormInput,
  deps: UpdateLawyerProfileDeps,
  ipAddress?: string,
): Promise<LawyerProfile> {
  const existing = await deps.lawyerProfileRepository.findByUserId(userId);
  if (!existing) {
    throw new NotFoundError("LawyerProfile");
  }

  if (input.isListed && !isLawyerVerified(existing)) {
    throw new ValidationError(
      "Your profile must be verified before it can be listed",
    );
  }

  const updated = await deps.lawyerProfileRepository.update(existing.id, {
    headline: input.headline,
    bio: input.bio,
    yearsOfExperience: input.yearsOfExperience,
    timezone: input.timezone,
    isListed: input.isListed,
  });

  await deps.auditLogRepository.create({
    actorUserId: userId,
    action: AuditAction.UPDATE,
    entityType: "LawyerProfile",
    entityId: updated.id,
    metadata: {
      headline: updated.headline,
      yearsOfExperience: updated.yearsOfExperience,
      timezone: updated.timezone,
      isListed: updated.isListed,
    },
    ipAddress,
  });

  return updated;
}
