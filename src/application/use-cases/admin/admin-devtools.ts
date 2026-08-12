import type { ActorContext } from "@/application/common/actor-context";
import { assertAdminDevtoolsEnabled } from "@/application/common/assert-admin-devtools";
import type { ConsultationOffering } from "@/domain/entities/consultation-offering";
import type { LawyerProfile } from "@/domain/entities/profile";
import type { User } from "@/domain/entities/user";
import {
  AuditAction,
  ConsultationModality,
  CredentialReviewStatus,
  LawyerVerificationStatus,
  UserRole,
  UserStatus,
} from "@/domain/enums";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-error";
import type { UnitOfWork } from "@/domain/ports/unit-of-work";
import type { ConsultationOfferingRepository } from "@/domain/repositories/consultation-offering-repository";
import type { LawyerCredentialRepository } from "@/domain/repositories/profile-repository";
import type { LawyerProfileRepository } from "@/domain/repositories/profile-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";
import { reviewLawyerCredentialUseCase } from "@/application/use-cases/verification/review-lawyer-credential";

export type AdminDevtoolsDeps = {
  userRepository: UserRepository;
  lawyerProfileRepository: LawyerProfileRepository;
  lawyerCredentialRepository: LawyerCredentialRepository;
  consultationOfferingRepository: ConsultationOfferingRepository;
  unitOfWork: UnitOfWork;
};

function requireAdmin(actor: ActorContext): void {
  assertAdminDevtoolsEnabled();
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }
}

export type AdminDevUserRow = {
  user: User;
  emailVerified: boolean;
  lawyerProfile: LawyerProfile | null;
  activeOfferingCount: number;
  directoryReady: boolean;
  blockers: string[];
};

export async function listAdminDevUsers(
  actor: ActorContext,
  deps: AdminDevtoolsDeps,
): Promise<AdminDevUserRow[]> {
  requireAdmin(actor);

  const [clients, lawyers] = await Promise.all([
    deps.userRepository.findByRole(UserRole.CLIENT),
    deps.userRepository.findByRole(UserRole.LAWYER),
  ]);

  const users = [...clients, ...lawyers].sort((a, b) =>
    a.email.localeCompare(b.email),
  );

  const rows: AdminDevUserRow[] = [];
  for (const user of users) {
    if (user.deletedAt) continue;
    const lawyerProfile =
      user.role === UserRole.LAWYER
        ? await deps.lawyerProfileRepository.findByUserId(user.id)
        : null;
    const activeOfferingCount = lawyerProfile
      ? (
          await deps.consultationOfferingRepository.findActiveByLawyerProfileId(
            lawyerProfile.id,
          )
        ).length
      : 0;

    const blockers: string[] = [];
    if (lawyerProfile) {
      if (!lawyerProfile.isListed) blockers.push("isListed=false");
      if (lawyerProfile.verificationStatus !== LawyerVerificationStatus.APPROVED) {
        blockers.push(`verification=${lawyerProfile.verificationStatus}`);
      }
      if (activeOfferingCount === 0) blockers.push("no_active_offering");
      if (lawyerProfile.deletedAt) blockers.push("profile_deleted");
    }

    rows.push({
      user,
      emailVerified: Boolean(user.emailVerified),
      lawyerProfile,
      activeOfferingCount,
      directoryReady: lawyerProfile != null && blockers.length === 0,
      blockers,
    });
  }

  return rows;
}

export async function markUserEmailVerifiedDev(
  actor: ActorContext,
  userId: string,
  deps: AdminDevtoolsDeps,
  ipAddress?: string,
): Promise<User> {
  requireAdmin(actor);
  const user = await deps.userRepository.findById(userId);
  if (!user || user.deletedAt) throw new NotFoundError("User", userId);

  const updated = await deps.userRepository.markEmailVerified(userId);
  await deps.unitOfWork.runInTransaction(async (repos) => {
    await repos.auditLogRepository.create({
      actorUserId: actor.userId,
      action: AuditAction.UPDATE,
      entityType: "User",
      entityId: userId,
      metadata: { adminDevtools: true, field: "emailVerified", value: true },
      ipAddress,
    });
  });
  return updated;
}

export async function setLawyerListedDev(
  actor: ActorContext,
  lawyerUserId: string,
  isListed: boolean,
  deps: AdminDevtoolsDeps,
  ipAddress?: string,
): Promise<LawyerProfile> {
  requireAdmin(actor);
  const profile =
    await deps.lawyerProfileRepository.findByUserId(lawyerUserId);
  if (!profile) throw new NotFoundError("LawyerProfile");

  const updated = await deps.lawyerProfileRepository.update(profile.id, {
    isListed,
  });
  await deps.unitOfWork.runInTransaction(async (repos) => {
    await repos.auditLogRepository.create({
      actorUserId: actor.userId,
      action: AuditAction.UPDATE,
      entityType: "LawyerProfile",
      entityId: profile.id,
      metadata: { adminDevtools: true, field: "isListed", value: isListed },
      ipAddress,
    });
  });
  return updated;
}

export async function setLawyerVerificationDev(
  actor: ActorContext,
  lawyerUserId: string,
  status: LawyerVerificationStatus,
  deps: AdminDevtoolsDeps,
  ipAddress?: string,
): Promise<LawyerProfile> {
  requireAdmin(actor);
  if (
    status !== LawyerVerificationStatus.APPROVED &&
    status !== LawyerVerificationStatus.PENDING &&
    status !== LawyerVerificationStatus.REJECTED
  ) {
    throw new ValidationError("Unsupported verification status for devtools");
  }

  const profile =
    await deps.lawyerProfileRepository.findByUserId(lawyerUserId);
  if (!profile) throw new NotFoundError("LawyerProfile");

  const updated = await deps.lawyerProfileRepository.updateVerificationStatus(
    profile.id,
    status,
    status === LawyerVerificationStatus.APPROVED ? new Date() : undefined,
  );

  if (status !== LawyerVerificationStatus.APPROVED && updated.isListed) {
    await deps.lawyerProfileRepository.update(profile.id, { isListed: false });
  }

  await deps.unitOfWork.runInTransaction(async (repos) => {
    await repos.auditLogRepository.create({
      actorUserId: actor.userId,
      action:
        status === LawyerVerificationStatus.APPROVED
          ? AuditAction.APPROVE
          : AuditAction.UPDATE,
      entityType: "LawyerProfile",
      entityId: profile.id,
      metadata: {
        adminDevtools: true,
        field: "verificationStatus",
        value: status,
      },
      ipAddress,
    });
  });

  return (
    (await deps.lawyerProfileRepository.findById(profile.id)) ?? updated
  );
}

export async function ensureActiveOfferingDev(
  actor: ActorContext,
  lawyerUserId: string,
  deps: AdminDevtoolsDeps,
  ipAddress?: string,
): Promise<ConsultationOffering> {
  requireAdmin(actor);
  const profile =
    await deps.lawyerProfileRepository.findByUserId(lawyerUserId);
  if (!profile) throw new NotFoundError("LawyerProfile");

  const offerings =
    await deps.consultationOfferingRepository.findByLawyerProfileId(
      profile.id,
    );
  const active = offerings.find((o) => o.isActive && !o.deletedAt);
  if (active) return active;

  const inactive = offerings.find((o) => !o.isActive && !o.deletedAt);
  const result = inactive
    ? await deps.consultationOfferingRepository.update(inactive.id, {
        isActive: true,
      })
    : await deps.consultationOfferingRepository.create({
        lawyerProfileId: profile.id,
        titleMn: "Dev consultation",
        titleEn: "Dev consultation",
        descriptionMn: "Created by admin developer tools for local testing.",
        durationMinutes: 30,
        priceMnt: 50_000,
        modality: ConsultationModality.ONLINE,
      });

  await deps.unitOfWork.runInTransaction(async (repos) => {
    await repos.auditLogRepository.create({
      actorUserId: actor.userId,
      action: inactive ? AuditAction.UPDATE : AuditAction.CREATE,
      entityType: "ConsultationOffering",
      entityId: result.id,
      metadata: {
        adminDevtools: true,
        action: inactive ? "reactivate" : "create_stub",
      },
      ipAddress,
    });
  });

  return result;
}

/** One-click: email verified + APPROVED + active offering + listed. */
export async function makeLawyerDirectoryReadyDev(
  actor: ActorContext,
  lawyerUserId: string,
  deps: AdminDevtoolsDeps,
  ipAddress?: string,
): Promise<{
  user: User;
  profile: LawyerProfile;
  offering: ConsultationOffering;
}> {
  requireAdmin(actor);
  const user = await markUserEmailVerifiedDev(
    actor,
    lawyerUserId,
    deps,
    ipAddress,
  );
  await setLawyerVerificationDev(
    actor,
    lawyerUserId,
    LawyerVerificationStatus.APPROVED,
    deps,
    ipAddress,
  );
  const offering = await ensureActiveOfferingDev(
    actor,
    lawyerUserId,
    deps,
    ipAddress,
  );
  const profile = await setLawyerListedDev(
    actor,
    lawyerUserId,
    true,
    deps,
    ipAddress,
  );
  return { user, profile, offering };
}

export async function bulkApprovePendingCredentialsDev(
  actor: ActorContext,
  deps: AdminDevtoolsDeps,
  ipAddress?: string,
): Promise<{ approved: number }> {
  requireAdmin(actor);
  const { items } = await deps.lawyerCredentialRepository.findPendingReview({
    take: 100,
  });

  let approved = 0;
  for (const credential of items) {
    if (credential.status !== CredentialReviewStatus.SUBMITTED) continue;
    await reviewLawyerCredentialUseCase(
      actor,
      {
        credentialId: credential.id,
        decision: CredentialReviewStatus.APPROVED,
      },
      {
        lawyerCredentialRepository: deps.lawyerCredentialRepository,
        unitOfWork: deps.unitOfWork,
      },
      ipAddress,
    );
    approved += 1;
  }

  return { approved };
}

export async function assertCanImpersonateTarget(
  actor: ActorContext,
  targetUserId: string,
  deps: Pick<AdminDevtoolsDeps, "userRepository">,
): Promise<User> {
  requireAdmin(actor);
  const target = await deps.userRepository.findById(targetUserId);
  if (!target || target.deletedAt) {
    throw new NotFoundError("User", targetUserId);
  }
  if (target.status !== UserStatus.ACTIVE) {
    throw new ValidationError("Can only impersonate ACTIVE users");
  }
  if (target.role === UserRole.ADMIN) {
    throw new ValidationError("Cannot impersonate another admin");
  }
  return target;
}
