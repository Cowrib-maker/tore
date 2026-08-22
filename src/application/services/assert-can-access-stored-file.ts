import type { ActorContext } from "@/application/common/actor-context";
import { UserRole } from "@/domain/enums";
import { ForbiddenError, ValidationError } from "@/domain/errors/domain-error";
import type { LawyerCredentialRepository } from "@/domain/repositories/profile-repository";
import type { LawyerProfileRepository } from "@/domain/repositories/profile-repository";
import { assertSafeStorageKey } from "@/infrastructure/storage/object-key";

export type StoredFileAccessDeps = {
  lawyerProfileRepository: LawyerProfileRepository;
  lawyerCredentialRepository: LawyerCredentialRepository;
  findLegalAiDocumentByStorageKey?: (
    key: string,
  ) => Promise<{ userId: string } | null>;
};

/**
 * Authorize download of a stored object key.
 * Keys are `{purpose}/{ownerId}/...` — for lawyer-credentials, ownerId is lawyerProfileId;
 * for legal-ai-document, ownerId is the owning user id.
 */
export async function assertCanAccessStoredFile(
  actor: ActorContext,
  key: string,
  deps: StoredFileAccessDeps,
): Promise<void> {
  assertSafeStorageKey(key);

  if (actor.role === UserRole.ADMIN) {
    return;
  }

  const [purpose, ownerId] = key.split("/");
  if (!purpose || !ownerId) {
    throw new ValidationError("Invalid storage key");
  }

  if (purpose === "lawyer-credential") {
    if (actor.role !== UserRole.LAWYER) {
      throw new ForbiddenError();
    }
    const profile = await deps.lawyerProfileRepository.findByUserId(
      actor.userId,
    );
    if (!profile || profile.id !== ownerId) {
      throw new ForbiddenError();
    }
    const credentials =
      await deps.lawyerCredentialRepository.findByLawyerProfileId(profile.id);
    if (!credentials.some((c) => c.documentUrl === key)) {
      throw new ForbiddenError();
    }
    return;
  }

  if (purpose === "legal-ai-document") {
    if (actor.role !== UserRole.LAWYER) {
      throw new ForbiddenError();
    }
    if (actor.userId !== ownerId) {
      throw new ForbiddenError();
    }
    const lookup = deps.findLegalAiDocumentByStorageKey;
    if (!lookup) {
      throw new ForbiddenError();
    }
    const document = await lookup(key);
    if (!document || document.userId !== actor.userId) {
      throw new ForbiddenError();
    }
    return;
  }

  // Other purposes gain accessors as modules ship (profile photos, matters, …).
  throw new ForbiddenError();
}
