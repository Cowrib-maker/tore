import type { ActorContext } from "@/application/common/actor-context";
import type { UpdateLawyerProfileFormInput } from "@/application/validators/profile.schema";
import type { LawyerProfile } from "@/domain/entities/profile";
import { AuditAction, UserRole } from "@/domain/enums";
import {
  ForbiddenError,
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
  actor: ActorContext,
  input: UpdateLawyerProfileFormInput,
  deps: UpdateLawyerProfileDeps,
  ipAddress?: string,
): Promise<LawyerProfile> {
  if (actor.role !== UserRole.LAWYER) {
    throw new ForbiddenError();
  }

  const existing = await deps.lawyerProfileRepository.findByUserId(
    actor.userId,
  );
  if (!existing) {
    throw new NotFoundError("LawyerProfile");
  }

  if (existing.userId !== actor.userId) {
    throw new ForbiddenError();
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
    actorUserId: actor.userId,
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
