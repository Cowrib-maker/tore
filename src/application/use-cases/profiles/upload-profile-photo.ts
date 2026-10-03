import { detectLegalAiDocumentFormat } from "@/application/ai/document-upload-validation";
import type { ActorContext } from "@/application/common/actor-context";
import { PROFILE_PHOTO_MAX_BYTES } from "@/application/validators/profile.schema";
import type { User } from "@/domain/entities/user";
import { AuditAction, UserRole } from "@/domain/enums";
import { ForbiddenError, NotFoundError } from "@/domain/errors/domain-error";
import { DocumentUploadError } from "@/domain/errors/document-upload-errors";
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

const PHOTO_MIME_BY_FORMAT = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

export const PROFILE_PHOTO_SIZE_MESSAGE =
  "Зураг 4МБ-аас ихгүй байх ёстой.";
export const PROFILE_PHOTO_TYPE_MESSAGE =
  "Зөвхөн JPEG, PNG эсвэл WebP зураг оруулна уу.";
export const PROFILE_PHOTO_STORAGE_MESSAGE =
  "Зургийг хадгалж чадсангүй. Одоогийн зураг хэвээр байна. Дахин оролдоно уу.";
export const PROFILE_PHOTO_SAVE_MESSAGE =
  "Зургийг бүртгэж чадсангүй. Одоогийн зураг хэвээр байна. Дахин оролдоно уу.";

/**
 * Any LAWYER-role account (attorney, prosecutor, judge, other-lawyer) may
 * upload a profile photo — it is part of the shared professional
 * workspace, not a marketplace feature. Public visibility is decided later,
 * per request, by the position/isListed gate in getPublicLawyerProfile.
 *
 * Only ever touches the actor's own User row. The previous photo is deleted
 * strictly after the new one is persisted, so any failure leaves the existing
 * photo intact; a failure after the new blob was stored removes that blob.
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

  // The bytes decide the type; the client-supplied MIME is never trusted.
  if (file.body.byteLength > PROFILE_PHOTO_MAX_BYTES) {
    throw new DocumentUploadError("FILE_TOO_LARGE", PROFILE_PHOTO_SIZE_MESSAGE);
  }
  const detected = detectLegalAiDocumentFormat(file.body);
  if (detected !== "jpeg" && detected !== "png" && detected !== "webp") {
    throw new DocumentUploadError(
      "UNSUPPORTED_FILE_TYPE",
      PROFILE_PHOTO_TYPE_MESSAGE,
    );
  }

  const previous = await deps.userRepository.findById(actor.userId);
  if (!previous) {
    throw new NotFoundError("User", actor.userId);
  }

  let stored;
  try {
    stored = await deps.fileStorage.upload({
      purpose: "profile-photo",
      ownerId: actor.userId,
      fileName: file.fileName,
      contentType: PHOTO_MIME_BY_FORMAT[detected],
      body: file.body,
    });
  } catch (error) {
    console.error("profile photo storage failed", describe(error));
    throw new DocumentUploadError("STORAGE_FAILED", PROFILE_PHOTO_STORAGE_MESSAGE);
  }

  let updated: User;
  try {
    updated = await deps.userRepository.updateProfile(actor.userId, {
      image: stored.key,
    });
  } catch (error) {
    console.error("profile photo save failed", describe(error));
    // Do not leave an orphan blob behind; the old photo is still referenced.
    await deps.fileStorage.delete(stored.key).catch(() => undefined);
    throw new DocumentUploadError(
      "DOCUMENT_SAVE_FAILED",
      PROFILE_PHOTO_SAVE_MESSAGE,
    );
  }

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

function describe(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`.slice(0, 300)
    : "non-error thrown";
}
