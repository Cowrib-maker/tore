import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserRole, UserStatus } from "@/domain/enums";

/**
 * requireActor's role parameter was widened from a single UserRole to
 * UserRole | UserRole[] so specific call sites (the /lawyer/workspace
 * surface) can opt in to allowing ADMIN alongside LAWYER, without changing
 * behavior anywhere else. These tests exercise the real requireActor
 * implementation (mocking only its two dependencies), matching the pattern
 * established in admin-verification-queue-authz.test.ts.
 */

const lookupAuthSession = vi.fn();
const findById = vi.fn();

vi.mock("@/application/common/session", () => ({
  lookupAuthSession: (...args: unknown[]) => lookupAuthSession(...args),
  getSessionUser: vi.fn(),
}));

vi.mock("@/infrastructure/repositories", () => ({
  userRepository: {
    findById: (...args: unknown[]) => findById(...args),
  },
}));

function sessionFor(userId: string, role: UserRole) {
  return {
    session: {
      user: { id: userId, role, status: UserStatus.ACTIVE },
      expires: new Date(Date.now() + 60_000).toISOString(),
    },
    replaced: false,
  };
}

function activeRecord(userId: string, role: UserRole) {
  return { id: userId, role, status: UserStatus.ACTIVE };
}

describe("requireActor", () => {
  beforeEach(() => {
    lookupAuthSession.mockReset();
    findById.mockReset();
  });

  describe("single-role form (existing call sites — behavior must be unchanged)", () => {
    it("accepts a matching role", async () => {
      lookupAuthSession.mockResolvedValue(sessionFor("u1", UserRole.LAWYER));
      findById.mockResolvedValue(activeRecord("u1", UserRole.LAWYER));

      const { requireActor } = await import("@/application/common/require-actor");
      const actor = await requireActor(UserRole.LAWYER);

      expect(actor).toEqual({ userId: "u1", role: UserRole.LAWYER });
    });

    it("rejects ADMIN when a single LAWYER role is required", async () => {
      lookupAuthSession.mockResolvedValue(sessionFor("admin-1", UserRole.ADMIN));
      findById.mockResolvedValue(activeRecord("admin-1", UserRole.ADMIN));

      const { requireActor } = await import("@/application/common/require-actor");

      await expect(requireActor(UserRole.LAWYER)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("rejects a mismatched role", async () => {
      lookupAuthSession.mockResolvedValue(sessionFor("c1", UserRole.CLIENT));
      findById.mockResolvedValue(activeRecord("c1", UserRole.CLIENT));

      const { requireActor } = await import("@/application/common/require-actor");

      await expect(requireActor(UserRole.LAWYER)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  });

  describe("array form (opt-in — used only by the /lawyer/workspace surface)", () => {
    it("accepts any role listed in the array", async () => {
      lookupAuthSession.mockResolvedValue(sessionFor("lawyer-1", UserRole.LAWYER));
      findById.mockResolvedValue(activeRecord("lawyer-1", UserRole.LAWYER));

      const { requireActor } = await import("@/application/common/require-actor");
      const actor = await requireActor([UserRole.LAWYER, UserRole.ADMIN]);

      expect(actor.role).toBe(UserRole.LAWYER);
    });

    it("accepts ADMIN when explicitly listed", async () => {
      lookupAuthSession.mockResolvedValue(sessionFor("admin-1", UserRole.ADMIN));
      findById.mockResolvedValue(activeRecord("admin-1", UserRole.ADMIN));

      const { requireActor } = await import("@/application/common/require-actor");
      const actor = await requireActor([UserRole.LAWYER, UserRole.ADMIN]);

      expect(actor.role).toBe(UserRole.ADMIN);
    });

    it("still rejects a role not in the array", async () => {
      lookupAuthSession.mockResolvedValue(sessionFor("client-1", UserRole.CLIENT));
      findById.mockResolvedValue(activeRecord("client-1", UserRole.CLIENT));

      const { requireActor } = await import("@/application/common/require-actor");

      await expect(
        requireActor([UserRole.LAWYER, UserRole.ADMIN]),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
});
