import { describe, expect, it, vi } from "vitest";

import { forceLogoutUserUseCase } from "@/application/use-cases/admin/force-logout-user";
import { AuditAction, UserRole } from "@/domain/enums";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-error";

function buildDeps(targetUser: object | null = { id: "target-1" }) {
  return {
    userRepository: {
      findById: vi.fn().mockResolvedValue(targetUser),
      rotateActiveSessionIdHash: vi.fn().mockResolvedValue(undefined),
    },
    auditLogRepository: {
      create: vi.fn().mockResolvedValue({}),
    },
  } as never;
}

describe("forceLogoutUserUseCase", () => {
  it("rejects non-ADMIN actors", async () => {
    const deps = buildDeps();
    await expect(
      forceLogoutUserUseCase(
        { userId: "u1", role: UserRole.LAWYER },
        { userId: "target-1" },
        deps,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("prevents an admin from force-logging-out their own session (self-lockout)", async () => {
    const deps = buildDeps();
    await expect(
      forceLogoutUserUseCase(
        { userId: "admin-1", role: UserRole.ADMIN },
        { userId: "admin-1" },
        deps,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(
      (deps as { userRepository: { rotateActiveSessionIdHash: ReturnType<typeof vi.fn> } })
        .userRepository.rotateActiveSessionIdHash,
    ).not.toHaveBeenCalled();
  });

  it("404s for a target user that does not exist", async () => {
    const deps = buildDeps(null);
    await expect(
      forceLogoutUserUseCase(
        { userId: "admin-1", role: UserRole.ADMIN },
        { userId: "ghost" },
        deps,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rotates the target's active-session hash to an unrelated value and audits it", async () => {
    const deps = buildDeps();
    await forceLogoutUserUseCase(
      { userId: "admin-1", role: UserRole.ADMIN },
      { userId: "target-1" },
      deps,
      "203.0.113.9",
    );

    const rotate = (
      deps as {
        userRepository: { rotateActiveSessionIdHash: ReturnType<typeof vi.fn> };
      }
    ).userRepository.rotateActiveSessionIdHash;
    expect(rotate).toHaveBeenCalledTimes(1);
    const [userId, hash] = rotate.mock.calls[0] as [string, string];
    expect(userId).toBe("target-1");
    // A 64-char hex SHA-256 hash, never a raw/guessable session id.
    expect(hash).toMatch(/^[a-f0-9]{64}$/);

    const audit = (
      deps as { auditLogRepository: { create: ReturnType<typeof vi.fn> } }
    ).auditLogRepository.create;
    expect(audit).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      action: AuditAction.UPDATE,
      entityType: "User",
      entityId: "target-1",
      metadata: { action: "force_logout" },
      ipAddress: "203.0.113.9",
    });
  });

  it("generates a fresh, unpredictable hash on every call (no fixed sentinel)", async () => {
    const deps = buildDeps();
    await forceLogoutUserUseCase(
      { userId: "admin-1", role: UserRole.ADMIN },
      { userId: "target-1" },
      deps,
    );
    await forceLogoutUserUseCase(
      { userId: "admin-1", role: UserRole.ADMIN },
      { userId: "target-1" },
      deps,
    );
    const rotate = (
      deps as {
        userRepository: { rotateActiveSessionIdHash: ReturnType<typeof vi.fn> };
      }
    ).userRepository.rotateActiveSessionIdHash;
    const [, firstHash] = rotate.mock.calls[0] as [string, string];
    const [, secondHash] = rotate.mock.calls[1] as [string, string];
    expect(firstHash).not.toBe(secondHash);
  });
});
