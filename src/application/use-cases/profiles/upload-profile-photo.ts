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
 * Profile photo for a LAWYER-role account (attorney, prosecutor, judge, other-lawyer) — part of the shared professional workspace, not a
 * marketplace feature. Public visibility is decided later, per request, by the position/isListed gate in getPublicLawyerProfile.
 *
 * Whose photo is written (decided here, never by the route):
 *  - LAWYER: always their own User row. Naming any other user in `targetUserId` is refused (ForbiddenError).
 *  - ADMIN: only the LAWYER account named in `targetUserId`. A missing, deleted or non-LAWYER target gets the same NotFoundError (no account
 *    probing). An ADMIN without `targetUserId` is refused (ForbiddenError): admins have no photo of their own here.
 *  - every other role: refused (ForbiddenError).
 * Audit: `actorUserId` is always the caller; for an admin acting on a lawyer, `entityId` is the lawyer and `metadata.onBehalfOfAdmin` is true.
 *
 * The previous photo is deleted strictly after the new one is persisted, so any failure leaves the existing photo intact; a failure after the
 * new blob was stored removes that blob.
 */
export async function uploadProfilePhotoUseCase(
  actor: ActorContext,
  file: UploadProfilePhotoFile,
  deps: UploadProfilePhotoDeps,
  ipAddress?: string,
  /** Admin only: the lawyer whose photo is being managed. */
  targetUserId?: string,
): Promise<User> {
  // Who owns the photo being written:
  //  - LAWYER: always themselves; naming another user is refused outright.
  //  - ADMIN: only an explicitly named LAWYER account (all administrative rights).
  //  - everyone else: refused.
  let ownerId: string;
  if (actor.role === UserRole.LAWYER) {
    if (targetUserId !== undefined && targetUserId !== actor.userId) {
      throw new ForbiddenError();
    }
    ownerId = actor.userId;
  } else if (actor.role === UserRole.ADMIN && targetUserId) {
    const target = await deps.userRepository.findById(targetUserId);
    if (!target || target.role !== UserRole.LAWYER) {
      // Same answer for "missing" and "not a lawyer": no account probing.
      throw new NotFoundError("User", targetUserId);
    }
    ownerId = target.id;
  } else {
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

  const previous = await deps.userRepository.findById(ownerId);
  if (!previous) {
    throw new NotFoundError("User", ownerId);
  }

  let stored;
  try {
    stored = await deps.fileStorage.upload({
      purpose: "profile-photo",
      ownerId,
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
    updated = await deps.userRepository.updateProfile(ownerId, {
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
    metadata: { field: "profilePhoto", ...(ownerId !== actor.userId ? { onBehalfOfAdmin: true } : {}) },
    ipAddress,
  });

  return updated;
}

function describe(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`.slice(0, 300)
    : "non-error thrown";
}
