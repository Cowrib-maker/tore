import type { ActorContext } from "@/application/common/actor-context";
import type { User } from "@/domain/entities/user";
import {
  AuditAction,
  LawyerVerificationStatus,
  UserRole,
  UserStatus,
} from "@/domain/enums";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-error";
import type { UnitOfWork } from "@/domain/ports/unit-of-work";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type {
  ListUsersInput,
  ListUsersResult,
  UserRepository,
} from "@/domain/repositories/user-repository";
import {
  generateActiveSessionId,
  hashActiveSessionId,
} from "@/domain/services/active-session";
import { createLawyerProfileWithUniqueSlug } from "@/domain/services/allocate-lawyer-slug";

export type ManageUsersDeps = {
  userRepository: UserRepository;
  auditLogRepository: AuditLogRepository;
};

/** Roles an admin may correct into/out of via {@link changeUserRoleUseCase}. ADMIN is deliberately excluded. */
const ROLE_CORRECTION_ELIGIBLE = new Set<UserRole>([
  UserRole.CLIENT,
  UserRole.LAWYER,
]);

function assertAdmin(actor: ActorContext) {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }
}

/** Invalidates the target's current session — same mechanism password-reset and admin force-logout use. */
async function forceEndSession(
  userRepository: Pick<UserRepository, "rotateActiveSessionIdHash">,
  userId: string,
): Promise<void> {
  await userRepository.rotateActiveSessionIdHash(
    userId,
    hashActiveSessionId(generateActiveSessionId()),
  );
}

export async function listUsersUseCase(
  actor: ActorContext,
  input: ListUsersInput,
  deps: Pick<ManageUsersDeps, "userRepository">,
): Promise<ListUsersResult> {
  assertAdmin(actor);
  return deps.userRepository.listUsers(input);
}

export async function setUserStatusUseCase(
  actor: ActorContext,
  input: { userId: string; status: UserStatus },
  deps: ManageUsersDeps,
  ipAddress?: string,
): Promise<User> {
  assertAdmin(actor);

  if (input.userId === actor.userId) {
    throw new ValidationError("You cannot change your own account status");
  }

  const updated = await deps.userRepository.updateStatus(
    input.userId,
    input.status,
  );

  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action:
      input.status === UserStatus.SUSPENDED
        ? AuditAction.SUSPEND
        : AuditAction.UPDATE,
    entityType: "User",
    entityId: input.userId,
    metadata: { status: input.status },
    ipAddress,
  });

  return updated;
}

/**
 * Soft-deletes an account by moving it to UserStatus.DEACTIVATED — the
 * terminal status already modeled in the schema, deliberately used instead
 * of a hard delete so Payment/Booking/CaseFile/AuditLog rows that reference
 * this userId are never orphaned or lose referential integrity. Ends the
 * user's current session immediately rather than waiting for the JWT's own
 * periodic re-check (PRIVILEGE_REFRESH_MS).
 */
export async function deactivateUserUseCase(
  actor: ActorContext,
  input: { userId: string; reason?: string },
  deps: { unitOfWork: UnitOfWork },
  ipAddress?: string,
): Promise<User> {
  assertAdmin(actor);

  if (input.userId === actor.userId) {
    throw new ValidationError("You cannot deactivate your own account");
  }

  return deps.unitOfWork.runInTransaction(async (repos) => {
    const target = await repos.userRepository.findById(input.userId);
    if (!target) {
      throw new NotFoundError("User", input.userId);
    }
    if (target.status === UserStatus.DEACTIVATED) {
      throw new ConflictError("This account is already deactivated");
    }

    const updated = await repos.userRepository.updateStatus(
      input.userId,
      UserStatus.DEACTIVATED,
    );
    await forceEndSession(repos.userRepository, input.userId);

    await repos.auditLogRepository.create({
      actorUserId: actor.userId,
      action: AuditAction.DELETE,
      entityType: "User",
      entityId: input.userId,
      metadata: {
        action: "user_deactivated",
        previousStatus: target.status,
        newStatus: UserStatus.DEACTIVATED,
        ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
      },
      ipAddress,
    });

    return updated;
  });
}

/** Restores a deactivated account to ACTIVE. Does not touch role or profile data. */
export async function reactivateUserUseCase(
  actor: ActorContext,
  input: { userId: string },
  deps: { unitOfWork: UnitOfWork },
  ipAddress?: string,
): Promise<User> {
  assertAdmin(actor);

  return deps.unitOfWork.runInTransaction(async (repos) => {
    const target = await repos.userRepository.findById(input.userId);
    if (!target) {
      throw new NotFoundError("User", input.userId);
    }
    if (target.status !== UserStatus.DEACTIVATED) {
      throw new ConflictError("Only a deactivated account can be reactivated");
    }

    const updated = await repos.userRepository.updateStatus(
      input.userId,
      UserStatus.ACTIVE,
    );

    await repos.auditLogRepository.create({
      actorUserId: actor.userId,
      action: AuditAction.UPDATE,
      entityType: "User",
      entityId: input.userId,
      metadata: {
        action: "user_reactivated",
        previousStatus: UserStatus.DEACTIVATED,
        newStatus: UserStatus.ACTIVE,
      },
      ipAddress,
    });

    return updated;
  });
}

/**
 * Corrects a mis-registered role between CLIENT and LAWYER only — never
 * touches ADMIN in either direction. Preserves the user's id/identity and
 * any historical LawyerProfile/ClientProfile row: switching TO LAWYER never
 * bypasses verification (a reused profile is reset to PENDING and unlisted,
 * a fresh one is created already PENDING via the same allocator normal
 * registration uses); switching TO CLIENT leaves the LawyerProfile,
 * credentials, offerings, and audit history untouched and simply orphaned
 * until/unless the account becomes LAWYER again. Ends the current session
 * so the role takes effect immediately rather than waiting up to
 * PRIVILEGE_REFRESH_MS for the JWT to catch up.
 */
export async function changeUserRoleUseCase(
  actor: ActorContext,
  input: { userId: string; newRole: UserRole },
  deps: { unitOfWork: UnitOfWork },
  ipAddress?: string,
): Promise<User> {
  assertAdmin(actor);

  if (input.userId === actor.userId) {
    throw new ValidationError("You cannot change your own role");
  }
  if (!ROLE_CORRECTION_ELIGIBLE.has(input.newRole)) {
    throw new ValidationError(
      "Role can only be corrected to CLIENT or LAWYER",
    );
  }

  return deps.unitOfWork.runInTransaction(async (repos) => {
    const target = await repos.userRepository.findById(input.userId);
    if (!target) {
      throw new NotFoundError("User", input.userId);
    }
    if (!ROLE_CORRECTION_ELIGIBLE.has(target.role)) {
      throw new ValidationError(
        "Only CLIENT/LAWYER accounts can be role-corrected here",
      );
    }
    if (target.role === input.newRole) {
      throw new ConflictError("User already has this role");
    }

    const updated = await repos.userRepository.updateRole(
      input.userId,
      input.newRole,
    );

    if (input.newRole === UserRole.LAWYER) {
      const existingProfile = await repos.lawyerProfileRepository.findByUserId(
        input.userId,
      );
      if (existingProfile) {
        // Reused from a prior LAWYER stint — never inherit old verification.
        await repos.lawyerProfileRepository.updateVerificationStatus(
          existingProfile.id,
          LawyerVerificationStatus.PENDING,
        );
        if (existingProfile.isListed) {
          await repos.lawyerProfileRepository.update(existingProfile.id, {
            isListed: false,
          });
        }
      } else {
        await createLawyerProfileWithUniqueSlug(
          target.name ?? target.email,
          input.userId,
          repos.lawyerProfileRepository,
        );
      }
    } else {
      const existingClientProfile =
        await repos.clientProfileRepository.findByUserId(input.userId);
      if (!existingClientProfile) {
        await repos.clientProfileRepository.create({ userId: input.userId });
      }
      // Deliberately untouched: LawyerProfile, credentials, offerings,
      // and their audit history stay exactly as they were.
    }

    await forceEndSession(repos.userRepository, input.userId);

    await repos.auditLogRepository.create({
      actorUserId: actor.userId,
      action: AuditAction.UPDATE,
      entityType: "User",
      entityId: input.userId,
      metadata: {
        action: "user_role_changed",
        previousRole: target.role,
        newRole: input.newRole,
      },
      ipAddress,
    });

    return updated;
  });
}
