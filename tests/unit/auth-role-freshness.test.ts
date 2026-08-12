import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  nodeAuthCallbacks,
  PRIVILEGE_REFRESH_MS,
} from "@/infrastructure/auth/auth.callbacks.node";
import { UserRole, UserStatus } from "@/domain/enums";
import { canAccessRoute, getDashboardPath } from "@/domain/services/rbac";

const findById = vi.fn();

vi.mock("@/infrastructure/repositories", () => ({
  userRepository: {
    findById: (...args: unknown[]) => findById(...args),
  },
}));

describe("RBAC route guards", () => {
  it("maps each role to its dashboard and blocks cross-role prefixes", () => {
    expect(getDashboardPath(UserRole.LAWYER)).toBe("/lawyer/dashboard");
    expect(getDashboardPath(UserRole.CLIENT)).toBe("/client/dashboard");
    expect(getDashboardPath(UserRole.ADMIN)).toBe("/admin/dashboard");

    expect(canAccessRoute(UserRole.CLIENT, "/lawyer/dashboard")).toBe(false);
    expect(canAccessRoute(UserRole.CLIENT, "/admin/dashboard")).toBe(false);
    expect(canAccessRoute(UserRole.LAWYER, "/client/bookings")).toBe(false);
    expect(canAccessRoute(UserRole.ADMIN, "/admin/lawyers")).toBe(true);
    expect(canAccessRoute(UserRole.ADMIN, "/lawyer/dashboard")).toBe(true);
  });
});

describe("JWT privilege refresh", () => {
  beforeEach(() => {
    findById.mockReset();
  });

  it("reloads role and status from the database after the refresh window", async () => {
    findById.mockResolvedValue({
      id: "u1",
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    });

    const jwt = nodeAuthCallbacks.jwt!;
    const token = await jwt({
      token: {
        id: "u1",
        role: UserRole.LAWYER,
        status: UserStatus.ACTIVE,
        statusCheckedAt: Date.now() - PRIVILEGE_REFRESH_MS - 1,
      },
      // Cast: Auth.js requires User on SignIn; refresh path uses token only.
      user: undefined as never,
      account: null,
      profile: undefined,
      trigger: "update",
      session: undefined,
    } as never);

    expect(findById).toHaveBeenCalledWith("u1");
    expect(token?.role).toBe(UserRole.CLIENT);
    expect(token?.status).toBe(UserStatus.ACTIVE);
  });

  it("fails closed when the user no longer exists", async () => {
    findById.mockResolvedValue(null);
    const jwt = nodeAuthCallbacks.jwt!;
    const token = await jwt({
      token: {
        id: "gone",
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        statusCheckedAt: 0,
      },
      user: undefined as never,
      account: null,
      profile: undefined,
      trigger: "update",
      session: undefined,
    } as never);
    expect(token).toEqual({});
  });
});
