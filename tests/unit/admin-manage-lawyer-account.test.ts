import { describe, expect, it, vi } from "vitest";

import {
  reinstateLawyerAccountUseCase,
  suspendLawyerAccountUseCase,
} from "@/application/use-cases/admin/manage-lawyer-account";
import { AuditAction, LawyerVerificationStatus, UserRole } from "@/domain/enums";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/domain/errors/domain-error";

function approvedProfile(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "lp-1",
    userId: "lawyer-1",
    isListed: true,
    verificationStatus: LawyerVerificationStatus.APPROVED,
    verifiedAt: new Date("2026-01-15T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

function suspendedProfile(overrides: Partial<Record<string, unknown>> = {}) {
  return approvedProfile({
    isListed: false,
    verificationStatus: LawyerVerificationStatus.SUSPENDED,
    ...overrides,
  });
}

function buildDeps(profile: object | null) {
  const auditCreate = vi.fn().mockResolvedValue({});
  const updateVerificationStatus = vi.fn().mockImplementation(
    async (id: string, status: LawyerVerificationStatus, verifiedAt?: Date) => ({
      ...(profile as object),
      verificationStatus: status,
      verifiedAt: verifiedAt ?? null,
    }),
  );
  const update = vi.fn().mockImplementation(async (id: string, patch: object) => ({
    ...(profile as object),
    ...patch,
  }));
  const findById = vi.fn().mockResolvedValue(profile);

  const txLawyerProfileRepository = {
    updateVerificationStatus,
    update,
    findById,
  };

  return {
    deps: {
      lawyerProfileRepository: { findById },
      unitOfWork: {
        runInTransaction: vi.fn(async (work: (repos: unknown) => Promise<unknown>) =>
          work({
            lawyerProfileRepository: txLawyerProfileRepository,
            auditLogRepository: { create: auditCreate },
          }),
        ),
      },
    } as never,
    auditCreate,
    updateVerificationStatus,
    update,
    findById,
  };
}

describe("suspendLawyerAccountUseCase", () => {
  it("rejects non-ADMIN actors", async () => {
    const { deps } = buildDeps(approvedProfile());
    await expect(
      suspendLawyerAccountUseCase(
        { userId: "u1", role: UserRole.LAWYER },
        { lawyerProfileId: "lp-1" },
        deps,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("404s for a lawyer profile that does not exist", async () => {
    const { deps } = buildDeps(null);
    await expect(
      suspendLawyerAccountUseCase(
        { userId: "admin-1", role: UserRole.ADMIN },
        { lawyerProfileId: "ghost" },
        deps,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses to suspend a lawyer who is not currently APPROVED", async () => {
    const { deps } = buildDeps(
      approvedProfile({ verificationStatus: LawyerVerificationStatus.PENDING }),
    );
    await expect(
      suspendLawyerAccountUseCase(
        { userId: "admin-1", role: UserRole.ADMIN },
        { lawyerProfileId: "lp-1" },
        deps,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("suspends an approved lawyer, unlists them, preserves verifiedAt, and audits it", async () => {
    const { deps, updateVerificationStatus, update, auditCreate } = buildDeps(
      approvedProfile(),
    );

    await suspendLawyerAccountUseCase(
      { userId: "admin-1", role: UserRole.ADMIN },
      { lawyerProfileId: "lp-1" },
      deps,
      "203.0.113.5",
    );

    expect(updateVerificationStatus).toHaveBeenCalledWith(
      "lp-1",
      LawyerVerificationStatus.SUSPENDED,
      new Date("2026-01-15T00:00:00.000Z"),
    );
    expect(update).toHaveBeenCalledWith("lp-1", { isListed: false });
    expect(auditCreate).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      action: AuditAction.SUSPEND,
      entityType: "LawyerProfile",
      entityId: "lp-1",
      metadata: {
        previousStatus: LawyerVerificationStatus.APPROVED,
        newStatus: LawyerVerificationStatus.SUSPENDED,
      },
      ipAddress: "203.0.113.5",
    });
  });

  it("does not call update(isListed) when the lawyer was already unlisted", async () => {
    const { deps, update } = buildDeps(approvedProfile({ isListed: false }));
    await suspendLawyerAccountUseCase(
      { userId: "admin-1", role: UserRole.ADMIN },
      { lawyerProfileId: "lp-1" },
      deps,
    );
    expect(update).not.toHaveBeenCalled();
  });
});

describe("reinstateLawyerAccountUseCase", () => {
  it("rejects non-ADMIN actors", async () => {
    const { deps } = buildDeps(suspendedProfile());
    await expect(
      reinstateLawyerAccountUseCase(
        { userId: "u1", role: UserRole.CLIENT },
        { lawyerProfileId: "lp-1" },
        deps,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses to reinstate a lawyer who is not currently SUSPENDED", async () => {
    const { deps } = buildDeps(approvedProfile());
    await expect(
      reinstateLawyerAccountUseCase(
        { userId: "admin-1", role: UserRole.ADMIN },
        { lawyerProfileId: "lp-1" },
        deps,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("restores a suspended lawyer to APPROVED, does not re-list, and audits it", async () => {
    const { deps, updateVerificationStatus, update, auditCreate } = buildDeps(
      suspendedProfile(),
    );

    await reinstateLawyerAccountUseCase(
      { userId: "admin-1", role: UserRole.ADMIN },
      { lawyerProfileId: "lp-1" },
      deps,
      "203.0.113.5",
    );

    expect(updateVerificationStatus).toHaveBeenCalledWith(
      "lp-1",
      LawyerVerificationStatus.APPROVED,
      expect.any(Date),
    );
    expect(update).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      action: AuditAction.UPDATE,
      entityType: "LawyerProfile",
      entityId: "lp-1",
      metadata: {
        previousStatus: LawyerVerificationStatus.SUSPENDED,
        newStatus: LawyerVerificationStatus.APPROVED,
        reinstated: true,
      },
      ipAddress: "203.0.113.5",
    });
  });
});
