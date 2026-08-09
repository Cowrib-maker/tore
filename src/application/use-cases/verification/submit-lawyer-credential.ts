import type { ActorContext } from "@/application/common/actor-context";
import type { SubmitLawyerCredentialFormInput } from "@/application/validators/verification.schema";
import type { LawyerCredential } from "@/domain/entities/profile";
import {
  AuditAction,
  CredentialReviewStatus,
  LawyerVerificationStatus,
  UserRole,
} from "@/domain/enums";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-error";
import type { FileStorage } from "@/domain/ports/file-storage";
import type { UnitOfWork } from "@/domain/ports/unit-of-work";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type {
  LawyerCredentialRepository,
  LawyerProfileRepository,
} from "@/domain/repositories/profile-repository";
import {
  canSubmitCredentials,
  isCredentialPendingReview,
} from "@/domain/services/lawyer-eligibility";

export type SubmitLawyerCredentialDeps = {
  lawyerProfileRepository: LawyerProfileRepository;
  lawyerCredentialRepository: LawyerCredentialRepository;
  auditLogRepository: AuditLogRepository;
  fileStorage: FileStorage;
  unitOfWork: UnitOfWork;
};

export type CredentialDocumentUpload = {
  fileName: string;
  contentType: string;
  body: Uint8Array;
};

export async function submitLawyerCredentialUseCase(
  actor: ActorContext,
  input: SubmitLawyerCredentialFormInput,
  document: CredentialDocumentUpload,
  deps: SubmitLawyerCredentialDeps,
  ipAddress?: string,
): Promise<LawyerCredential> {
  if (actor.role !== UserRole.LAWYER) {
    throw new ForbiddenError();
  }

  const profile = await deps.lawyerProfileRepository.findByUserId(actor.userId);
  if (!profile) {
    throw new NotFoundError("LawyerProfile");
  }

  if (!canSubmitCredentials(profile)) {
    throw new ValidationError(
      "Credentials cannot be submitted while verification is approved or suspended",
    );
  }

  const existing = await deps.lawyerCredentialRepository.findByLawyerProfileId(
    profile.id,
  );
  if (existing.some((c) => isCredentialPendingReview(c.status))) {
    throw new ConflictError(
      "A credential submission is already awaiting admin review",
    );
  }

  const stored = await deps.fileStorage.upload({
    purpose: "lawyer-credential",
    ownerId: profile.id,
    fileName: document.fileName,
    contentType: document.contentType,
    body: document.body,
  });

  try {
    return await deps.unitOfWork.runInTransaction(async (repos) => {
      const credential = await repos.lawyerCredentialRepository.create({
        lawyerProfileId: profile.id,
        licenseNumber: input.licenseNumber,
        issuingAuthority: input.issuingAuthority,
        documentUrl: stored.key,
        documentFileName: stored.originalFileName,
      });

      if (profile.verificationStatus === LawyerVerificationStatus.REJECTED) {
        await repos.lawyerProfileRepository.updateVerificationStatus(
          profile.id,
          LawyerVerificationStatus.PENDING,
        );
      }

      await repos.auditLogRepository.create({
        actorUserId: actor.userId,
        action: AuditAction.CREATE,
        entityType: "LawyerCredential",
        entityId: credential.id,
        metadata: {
          licenseNumber: credential.licenseNumber,
          issuingAuthority: credential.issuingAuthority,
          documentKey: stored.key,
          status: CredentialReviewStatus.SUBMITTED,
        },
        ipAddress,
      });

      return credential;
    });
  } catch (error) {
    await deps.fileStorage.delete(stored.key).catch(() => undefined);
    throw error;
  }
}
