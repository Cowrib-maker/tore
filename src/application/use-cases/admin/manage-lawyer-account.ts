import type { ActorContext } from "@/application/common/actor-context";
import type { LawyerProfile } from "@/domain/entities/profile";
import { AuditAction, LawyerVerificationStatus, UserRole } from "@/domain/enums";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/domain/errors/domain-error";
import type { UnitOfWork } from "@/domain/ports/unit-of-work";
import type { LawyerProfileRepository } from "@/domain/repositories/profile-repository";

export type ManageLawyerAccountDeps = {
  lawyerProfileRepository: LawyerProfileRepository;
  unitOfWork: UnitOfWork;
};

function assertAdmin(actor: ActorContext) {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }
}

async function loadProfileOrThrow(
  lawyerProfileRepository: LawyerProfileRepository,
  lawyerProfileId: string,
): Promise<LawyerProfile> {
  const profile = await lawyerProfileRepository.findById(lawyerProfileId);
  if (!profile) {
    throw new NotFoundError("LawyerProfile", lawyerProfileId);
  }
  return profile;
}

/**
 * Suspends a previously APPROVED lawyer — a production, always-available
 * admin action, distinct from the credential approve/reject flow (which is
 * untouched) and from the non-production devtools status setter (which
 * this never calls). Unlists the lawyer, mirroring the existing
 * unlist-on-non-approved behavior in reviewLawyerCredentialUseCase, but
 * preserves the original `verifiedAt` timestamp (passed explicitly) so a
 * later reinstatement does not read as a brand-new approval.
 */
export async function suspendLawyerAccountUseCase(
  actor: ActorContext,
  input: { lawyerProfileId: string },
  deps: ManageLawyerAccountDeps,
  ipAddress?: string,
): Promise<LawyerProfile> {
  assertAdmin(actor);

  const profile = await loadProfileOrThrow(
    deps.lawyerProfileRepository,
    input.lawyerProfileId,
  );

  if (profile.verificationStatus !== LawyerVerificationStatus.APPROVED) {
    throw new ConflictError(
      "Only an approved lawyer can be suspended",
    );
  }

  return deps.unitOfWork.runInTransaction(async (repos) => {
    await repos.lawyerProfileRepository.updateVerificationStatus(
      profile.id,
      LawyerVerificationStatus.SUSPENDED,
      profile.verifiedAt ?? undefined,
    );

    if (profile.isListed) {
      await repos.lawyerProfileRepository.update(profile.id, {
        isListed: false,
      });
    }

    await repos.auditLogRepository.create({
      actorUserId: actor.userId,
      action: AuditAction.SUSPEND,
      entityType: "LawyerProfile",
      entityId: profile.id,
      metadata: {
        previousStatus: profile.verificationStatus,
        newStatus: LawyerVerificationStatus.SUSPENDED,
      },
      ipAddress,
    });

    const updated = await repos.lawyerProfileRepository.findById(profile.id);
    if (!updated) {
      throw new NotFoundError("LawyerProfile", profile.id);
    }
    return updated;
  });
}

/**
 * Restores a SUSPENDED lawyer to APPROVED. Deliberately does not re-list
 * them — listing stays a separate, explicit decision via the existing
 * setLawyerDirectoryListingUseCase, unchanged by this action.
 */
export async function reinstateLawyerAccountUseCase(
  actor: ActorContext,
  input: { lawyerProfileId: string },
  deps: ManageLawyerAccountDeps,
  ipAddress?: string,
): Promise<LawyerProfile> {
  assertAdmin(actor);

  const profile = await loadProfileOrThrow(
    deps.lawyerProfileRepository,
    input.lawyerProfileId,
  );

  if (profile.verificationStatus !== LawyerVerificationStatus.SUSPENDED) {
    throw new ConflictError("Only a suspended lawyer can be reinstated");
  }

  return deps.unitOfWork.runInTransaction(async (repos) => {
    const updated = await repos.lawyerProfileRepository.updateVerificationStatus(
      profile.id,
      LawyerVerificationStatus.APPROVED,
      new Date(),
    );

    await repos.auditLogRepository.create({
      actorUserId: actor.userId,
      action: AuditAction.UPDATE,
      entityType: "LawyerProfile",
      entityId: profile.id,
      metadata: {
        previousStatus: LawyerVerificationStatus.SUSPENDED,
        newStatus: LawyerVerificationStatus.APPROVED,
        reinstated: true,
      },
      ipAddress,
    });

    return updated;
  });
}
