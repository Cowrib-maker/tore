import type { ActorContext } from "@/application/common/actor-context";
import type { UpdateLawyerProfileFormInput } from "@/application/validators/profile.schema";
import type { LawyerProfile } from "@/domain/entities/profile";
import { AuditAction, UserRole } from "@/domain/enums";
import { ForbiddenError, NotFoundError } from "@/domain/errors/domain-error";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type { LawyerProfileRepository } from "@/domain/repositories/profile-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";
import { joinDisplayName } from "@/lib/person-name";

export type UpdateLawyerProfileDeps = {
  lawyerProfileRepository: LawyerProfileRepository;
  userRepository: UserRepository;
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

  const displayName = joinDisplayName(input.lastName, input.firstName);
  if (displayName) {
    await deps.userRepository.updateProfile(actor.userId, { name: displayName });
  }

  const updated = await deps.lawyerProfileRepository.update(existing.id, {
    headline: input.headline,
    bio: input.bio,
    yearsOfExperience: input.yearsOfExperience,
    city: input.city,
    education: input.education,
    phone: input.phone,
    timezone: input.timezone,
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
      phone: updated.phone,
    },
    ipAddress,
  });

  return updated;
}
