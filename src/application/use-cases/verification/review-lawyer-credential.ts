import type { ActorContext } from "@/application/common/actor-context";
import type { ReviewLawyerCredentialFormInput } from "@/application/validators/verification.schema";
import type { LawyerCredential, LawyerProfile } from "@/domain/entities/profile";
import {
  AuditAction,
  CredentialReviewStatus,
  LawyerVerificationStatus,
  NotificationType,
  UserRole,
} from "@/domain/enums";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-error";
import type { UnitOfWork } from "@/domain/ports/unit-of-work";
import type { LawyerCredentialRepository } from "@/domain/repositories/profile-repository";
import { isCredentialPendingReview } from "@/domain/services/lawyer-eligibility";

export type ReviewLawyerCredentialDeps = {
  lawyerCredentialRepository: LawyerCredentialRepository;
  unitOfWork: UnitOfWork;
};

export type ReviewLawyerCredentialResult = {
  credential: LawyerCredential;
  profile: LawyerProfile;
};

export async function reviewLawyerCredentialUseCase(
  actor: ActorContext,
  input: ReviewLawyerCredentialFormInput,
  deps: ReviewLawyerCredentialDeps,
  ipAddress?: string,
): Promise<ReviewLawyerCredentialResult> {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }

  const credential = await deps.lawyerCredentialRepository.findById(
    input.credentialId,
  );
  if (!credential) {
    throw new NotFoundError("LawyerCredential", input.credentialId);
  }

  if (!isCredentialPendingReview(credential.status)) {
    throw new ConflictError("This credential has already been reviewed");
  }

  if (
    input.decision !== CredentialReviewStatus.APPROVED &&
    input.decision !== CredentialReviewStatus.REJECTED
  ) {
    throw new ValidationError("Decision must be APPROVED or REJECTED");
  }

  return deps.unitOfWork.runInTransaction(async (repos) => {
    const reviewed = await repos.lawyerCredentialRepository.review(
      credential.id,
      {
        status: input.decision,
        rejectionReason:
          input.decision === CredentialReviewStatus.REJECTED
            ? input.rejectionReason
            : undefined,
        reviewedByUserId: actor.userId,
      },
    );

    const approved = input.decision === CredentialReviewStatus.APPROVED;
    const profile = await repos.lawyerProfileRepository.updateVerificationStatus(
      credential.lawyerProfileId,
      approved
        ? LawyerVerificationStatus.APPROVED
        : LawyerVerificationStatus.REJECTED,
      approved ? new Date() : undefined,
    );

    if (!approved && profile.isListed) {
      await repos.lawyerProfileRepository.update(profile.id, {
        isListed: false,
      });
    }

    const lawyerProfile = await repos.lawyerProfileRepository.findById(
      credential.lawyerProfileId,
    );
    if (!lawyerProfile) {
      throw new NotFoundError("LawyerProfile", credential.lawyerProfileId);
    }

    await repos.auditLogRepository.create({
      actorUserId: actor.userId,
      action: approved ? AuditAction.APPROVE : AuditAction.REJECT,
      entityType: "LawyerCredential",
      entityId: reviewed.id,
      metadata: {
        lawyerProfileId: credential.lawyerProfileId,
        decision: input.decision,
        rejectionReason: reviewed.rejectionReason,
      },
      ipAddress,
    });

    await repos.notificationRepository.create({
      userId: lawyerProfile.userId,
      type: approved
        ? NotificationType.LAWYER_APPROVED
        : NotificationType.LAWYER_REJECTED,
      title: approved ? "License approved" : "License rejected",
      body: approved
        ? "Your lawyer credentials were approved. Add an active offering before listing on the marketplace."
        : `Your lawyer credentials were rejected. ${reviewed.rejectionReason ?? ""}`.trim(),
      metadata: {
        credentialId: reviewed.id,
        lawyerProfileId: lawyerProfile.id,
      },
    });

    const finalProfile =
      (await repos.lawyerProfileRepository.findById(lawyerProfile.id)) ??
      lawyerProfile;

    return { credential: reviewed, profile: finalProfile };
  });
}
