import type { ActorContext } from "@/application/common/actor-context";
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

export type SetLawyerDirectoryListingDeps = {
  lawyerProfileRepository: LawyerProfileRepository;
  auditLogRepository: AuditLogRepository;
};

export async function setLawyerDirectoryListingUseCase(
  actor: ActorContext,
  input: { lawyerProfileId: string; isListed: boolean },
  deps: SetLawyerDirectoryListingDeps,
  ipAddress?: string,
): Promise<LawyerProfile> {
  const existing = await deps.lawyerProfileRepository.findById(
    input.lawyerProfileId,
  );
  if (!existing) {
    throw new NotFoundError("LawyerProfile");
  }

  const isAdmin = actor.role === UserRole.ADMIN;
  const isOwner =
    actor.role === UserRole.LAWYER && actor.userId === existing.userId;
  if (!isAdmin && !isOwner) {
    throw new ForbiddenError();
  }

  if (input.isListed && !isLawyerVerified(existing)) {
    throw new ValidationError(
      "Only approved lawyers can be listed in the public directory",
    );
  }

  const updated = await deps.lawyerProfileRepository.update(existing.id, {
    isListed: input.isListed,
  });

  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action: AuditAction.UPDATE,
    entityType: "LawyerProfile",
    entityId: updated.id,
    metadata: { field: "isListed", value: updated.isListed },
    ipAddress,
  });

  return updated;
}
