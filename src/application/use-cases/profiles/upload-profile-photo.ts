import type { ActorContext } from "@/application/common/actor-context";
import type { User } from "@/domain/entities/user";
import { AuditAction, UserRole } from "@/domain/enums";
import { ForbiddenError, NotFoundError } from "@/domain/errors/domain-error";
import type { FileStorage } from "@/domain/ports/file-storage";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";

export type UploadProfilePhotoDeps = {
  userRepository: UserRepository;
  auditLogRepository: AuditLogRepository;
  fileStorage: FileStorage;
};

export type UploadProfilePhotoFile = {
  fileName: string;
  contentType: string;
  body: Uint8Array;
};

/**
 * Any LAWYER-role account (attorney, prosecutor, judge, other-lawyer) may
 * upload a profile photo — it is part of the shared professional
 * workspace, not a marketplace feature. Public visibility is decided later,
 * per request, by the position/isListed gate in getPublicLawyerProfile.
 */
export async function uploadProfilePhotoUseCase(
  actor: ActorContext,
  file: UploadProfilePhotoFile,
  deps: UploadProfilePhotoDeps,
  ipAddress?: string,
): Promise<User> {
  if (actor.role !== UserRole.LAWYER) {
    throw new ForbiddenError();
  }

  const previous = await deps.userRepository.findById(actor.userId);
  if (!previous) {
    throw new NotFoundError("User", actor.userId);
  }

  const stored = await deps.fileStorage.upload({
    purpose: "profile-photo",
    ownerId: actor.userId,
    fileName: file.fileName,
    contentType: file.contentType,
    body: file.body,
  });

  const updated = await deps.userRepository.updateProfile(actor.userId, {
    image: stored.key,
  });

  // Best-effort cleanup of the previous photo; never blocks the new upload.
  if (
    previous.image &&
    previous.image.startsWith("profile-photo/") &&
    previous.image !== stored.key
  ) {
    try {
      await deps.fileStorage.delete(previous.image);
    } catch {
      // Orphaned object — acceptable, not user-visible.
    }
  }

  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action: AuditAction.UPDATE,
    entityType: "User",
    entityId: updated.id,
    metadata: { field: "profilePhoto" },
    ipAddress,
  });

  return updated;
}
