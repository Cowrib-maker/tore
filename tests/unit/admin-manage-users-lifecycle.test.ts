import { describe, expect, it, vi } from "vitest";

import {
  changeUserRoleUseCase,
  deactivateUserUseCase,
  reactivateUserUseCase,
} from "@/application/use-cases/admin/manage-users";
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

function fakeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "target-1",
    email: "target@example.mn",
    name: "Target User",
    role: UserRole.CLIENT,
    status: UserStatus.ACTIVE,
    emailVerified: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function buildDeps(
  targetUser: object | null,
  overrides: {
    existingLawyerProfile?: object | null;
    existingClientProfile?: object | null;
  } = {},
) {
  const auditCreate = vi.fn().mockResolvedValue({});
  const rotateActiveSessionIdHash = vi.fn().mockResolvedValue(undefined);
  const updateRole = vi.fn().mockImplementation(async (id: string, role: UserRole) => ({
    ...(targetUser as object),
    role,
  }));
  const updateStatus = vi.fn().mockImplementation(async (id: string, status: UserStatus) => ({
    ...(targetUser as object),
    status,
  }));
  const findById = vi.fn().mockResolvedValue(targetUser);

  const lawyerProfileFindByUserId = vi
    .fn()
    .mockResolvedValue(overrides.existingLawyerProfile ?? null);
  const lawyerProfileCreate = vi.fn().mockResolvedValue({
    id: "lp-new",
    userId: (targetUser as { id?: string })?.id,
    slug: "target-user-abcd",
    verificationStatus: LawyerVerificationStatus.PENDING,
    isListed: false,
  });
  const lawyerProfileUpdateVerificationStatus = vi.fn().mockResolvedValue({});
  const lawyerProfileUpdate = vi.fn().mockResolvedValue({});

  const clientProfileFindByUserId = vi
    .fn()
    .mockResolvedValue(overrides.existingClientProfile ?? null);
  const clientProfileCreate = vi.fn().mockResolvedValue({});

  const txRepos = {
    userRepository: {
      findById,
      updateRole,
      updateStatus,
      rotateActiveSessionIdHash,
    },
    lawyerProfileRepository: {
      findByUserId: lawyerProfileFindByUserId,
      create: lawyerProfileCreate,
      updateVerificationStatus: lawyerProfileUpdateVerificationStatus,
      update: lawyerProfileUpdate,
    },
    clientProfileRepository: {
      findByUserId: clientProfileFindByUserId,
      create: clientProfileCreate,
    },
    auditLogRepository: { create: auditCreate },
  };

  return {
    deps: {
      unitOfWork: {
        runInTransaction: vi.fn(async (work: (repos: unknown) => Promise<unknown>) =>
          work(txRepos),
        ),
      },
    } as never,
    auditCreate,
    rotateActiveSessionIdHash,
    updateRole,
    updateStatus,
    findById,
    lawyerProfileFindByUserId,
    lawyerProfileCreate,
    lawyerProfileUpdateVerificationStatus,
    lawyerProfileUpdate,
    clientProfileFindByUserId,
    clientProfileCreate,
  };
}

const ADMIN = { userId: "admin-1", role: UserRole.ADMIN };

describe("changeUserRoleUseCase", () => {
  it("1. allows ADMIN to change CLIENT -> LAWYER, creating a PENDING lawyer profile", async () => {
    const { deps, updateRole, lawyerProfileCreate, rotateActiveSessionIdHash } =
      buildDeps(fakeUser({ role: UserRole.CLIENT }));

    const result = await changeUserRoleUseCase(
      ADMIN,
      { userId: "target-1", newRole: UserRole.LAWYER },
      deps,
    );

    expect(updateRole).toHaveBeenCalledWith("target-1", UserRole.LAWYER);
    expect(lawyerProfileCreate).toHaveBeenCalledTimes(1);
    const createArgs = lawyerProfileCreate.mock.calls[0]![0] as {
      userId: string;
    };
    expect(createArgs.userId).toBe("target-1");
    expect(rotateActiveSessionIdHash).toHaveBeenCalledWith(
      "target-1",
      expect.any(String),
    );
    expect(result.role).toBe(UserRole.LAWYER);
  });

  it("2. allows ADMIN to change LAWYER -> CLIENT without touching the lawyer profile", async () => {
    const { deps, updateRole, lawyerProfileUpdateVerificationStatus, lawyerProfileUpdate, clientProfileCreate } =
      buildDeps(fakeUser({ role: UserRole.LAWYER }));

    await changeUserRoleUseCase(
      ADMIN,
      { userId: "target-1", newRole: UserRole.CLIENT },
      deps,
    );

    expect(updateRole).toHaveBeenCalledWith("target-1", UserRole.CLIENT);
    expect(clientProfileCreate).toHaveBeenCalledWith({ userId: "target-1" });
    // The lawyer profile/credentials/offerings are never touched on LAWYER -> CLIENT.
    expect(lawyerProfileUpdateVerificationStatus).not.toHaveBeenCalled();
    expect(lawyerProfileUpdate).not.toHaveBeenCalled();
  });

  it("3. rejects a non-ADMIN actor", async () => {
    const { deps } = buildDeps(fakeUser({ role: UserRole.CLIENT }));
    await expect(
      changeUserRoleUseCase(
        { userId: "lawyer-1", role: UserRole.LAWYER },
        { userId: "target-1", newRole: UserRole.LAWYER },
        deps,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("4. prevents ADMIN from changing their own role", async () => {
    const { deps, updateRole } = buildDeps(fakeUser({ id: "admin-1" }));
    await expect(
      changeUserRoleUseCase(
        ADMIN,
        { userId: "admin-1", newRole: UserRole.LAWYER },
        deps,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(updateRole).not.toHaveBeenCalled();
  });

  it("6. writes an AuditLog entry with previous/new role and actor/target ids", async () => {
    const { deps, auditCreate } = buildDeps(fakeUser({ role: UserRole.CLIENT }));
    await changeUserRoleUseCase(
      ADMIN,
      { userId: "target-1", newRole: UserRole.LAWYER },
      deps,
      "203.0.113.7",
    );
    expect(auditCreate).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      action: AuditAction.UPDATE,
      entityType: "User",
      entityId: "target-1",
      metadata: {
        action: "user_role_changed",
        previousRole: UserRole.CLIENT,
        newRole: UserRole.LAWYER,
      },
      ipAddress: "203.0.113.7",
    });
  });

  it("8. never sets an existing (reused) lawyer profile straight to APPROVED — verification is not bypassed", async () => {
    const { deps, lawyerProfileUpdateVerificationStatus, lawyerProfileUpdate, lawyerProfileCreate } =
      buildDeps(fakeUser({ role: UserRole.CLIENT }), {
        existingLawyerProfile: {
          id: "lp-old",
          userId: "target-1",
          verificationStatus: LawyerVerificationStatus.APPROVED,
          isListed: true,
        },
      });

    await changeUserRoleUseCase(
      ADMIN,
      { userId: "target-1", newRole: UserRole.LAWYER },
      deps,
    );

    // Reused the existing profile rather than creating a duplicate...
    expect(lawyerProfileCreate).not.toHaveBeenCalled();
    // ...but reset it to PENDING rather than inheriting the old APPROVED status.
    expect(lawyerProfileUpdateVerificationStatus).toHaveBeenCalledWith(
      "lp-old",
      LawyerVerificationStatus.PENDING,
    );
    // And unlisted it, since it can no longer be publicly listed unverified.
    expect(lawyerProfileUpdate).toHaveBeenCalledWith("lp-old", {
      isListed: false,
    });
  });

  it("9. does not delete the lawyer profile/history when switching LAWYER -> CLIENT", async () => {
    const { deps, lawyerProfileCreate, lawyerProfileUpdate, lawyerProfileUpdateVerificationStatus } =
      buildDeps(fakeUser({ role: UserRole.LAWYER }), {
        existingLawyerProfile: {
          id: "lp-history",
          userId: "target-1",
          verificationStatus: LawyerVerificationStatus.APPROVED,
          isListed: true,
        },
      });

    await changeUserRoleUseCase(
      ADMIN,
      { userId: "target-1", newRole: UserRole.CLIENT },
      deps,
    );

    // No delete method exists on the fake repo at all, and none of its
    // mutating methods were called — the lawyer profile row and its
    // verification history are left completely untouched.
    expect(lawyerProfileCreate).not.toHaveBeenCalled();
    expect(lawyerProfileUpdate).not.toHaveBeenCalled();
    expect(lawyerProfileUpdateVerificationStatus).not.toHaveBeenCalled();
  });

  it("10. 404s for a target user that does not exist (no unauthorized modification of an unresolvable id)", async () => {
    const { deps, updateRole } = buildDeps(null);
    await expect(
      changeUserRoleUseCase(
        ADMIN,
        { userId: "ghost", newRole: UserRole.LAWYER },
        deps,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(updateRole).not.toHaveBeenCalled();
  });

  it("refuses to role-correct an ADMIN account, and refuses to correct into ADMIN", async () => {
    const adminTarget = buildDeps(fakeUser({ id: "other-admin", role: UserRole.ADMIN }));
    await expect(
      changeUserRoleUseCase(
        ADMIN,
        { userId: "other-admin", newRole: UserRole.LAWYER },
        adminTarget.deps,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const clientTarget = buildDeps(fakeUser({ role: UserRole.CLIENT }));
    await expect(
      changeUserRoleUseCase(
        ADMIN,
        { userId: "target-1", newRole: UserRole.ADMIN },
        clientTarget.deps,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a no-op role change (already has this role)", async () => {
    const { deps } = buildDeps(fakeUser({ role: UserRole.LAWYER }));
    await expect(
      changeUserRoleUseCase(
        ADMIN,
        { userId: "target-1", newRole: UserRole.LAWYER },
        deps,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("deactivateUserUseCase", () => {
  it("5. prevents ADMIN from deactivating their own account", async () => {
    const { deps, updateStatus } = buildDeps(fakeUser({ id: "admin-1" }));
    await expect(
      deactivateUserUseCase(ADMIN, { userId: "admin-1" }, deps),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it("rejects a non-ADMIN actor", async () => {
    const { deps } = buildDeps(fakeUser());
    await expect(
      deactivateUserUseCase(
        { userId: "lawyer-1", role: UserRole.LAWYER },
        { userId: "target-1" },
        deps,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("7. deactivates the target, ends their session, and writes an AuditLog entry with the reason", async () => {
    const { deps, updateStatus, rotateActiveSessionIdHash, auditCreate } =
      buildDeps(fakeUser({ status: UserStatus.ACTIVE }));

    await deactivateUserUseCase(
      ADMIN,
      { userId: "target-1", reason: "Fraudulent signup" },
      deps,
      "203.0.113.2",
    );

    expect(updateStatus).toHaveBeenCalledWith("target-1", UserStatus.DEACTIVATED);
    expect(rotateActiveSessionIdHash).toHaveBeenCalledWith(
      "target-1",
      expect.any(String),
    );
    expect(auditCreate).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      action: AuditAction.DELETE,
      entityType: "User",
      entityId: "target-1",
      metadata: {
        action: "user_deactivated",
        previousStatus: UserStatus.ACTIVE,
        newStatus: UserStatus.DEACTIVATED,
        reason: "Fraudulent signup",
      },
      ipAddress: "203.0.113.2",
    });
  });

  it("10. 404s for a target user that does not exist", async () => {
    const { deps } = buildDeps(null);
    await expect(
      deactivateUserUseCase(ADMIN, { userId: "ghost" }, deps),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses to deactivate an already-deactivated account", async () => {
    const { deps } = buildDeps(fakeUser({ status: UserStatus.DEACTIVATED }));
    await expect(
      deactivateUserUseCase(ADMIN, { userId: "target-1" }, deps),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("reactivateUserUseCase", () => {
  it("rejects a non-ADMIN actor", async () => {
    const { deps } = buildDeps(fakeUser({ status: UserStatus.DEACTIVATED }));
    await expect(
      reactivateUserUseCase(
        { userId: "u1", role: UserRole.CLIENT },
        { userId: "target-1" },
        deps,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("restores a deactivated account to ACTIVE and audits it", async () => {
    const { deps, updateStatus, auditCreate } = buildDeps(
      fakeUser({ status: UserStatus.DEACTIVATED }),
    );
    await reactivateUserUseCase(ADMIN, { userId: "target-1" }, deps);
    expect(updateStatus).toHaveBeenCalledWith("target-1", UserStatus.ACTIVE);
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        metadata: expect.objectContaining({ action: "user_reactivated" }),
      }),
    );
  });

  it("refuses to reactivate a non-deactivated account", async () => {
    const { deps } = buildDeps(fakeUser({ status: UserStatus.ACTIVE }));
    await expect(
      reactivateUserUseCase(ADMIN, { userId: "target-1" }, deps),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
