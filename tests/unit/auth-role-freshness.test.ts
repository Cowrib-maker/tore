import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  nodeAuthCallbacks,
  PRIVILEGE_REFRESH_MS,
} from "@/infrastructure/auth/auth.callbacks.node";
import { UserRole, UserStatus } from "@/domain/enums";
import type { Session } from "next-auth";
import {
  generateActiveSessionId,
  hashActiveSessionId,
} from "@/domain/services/active-session";
import {
  canAccessRoute,
  getDashboardPath,
  getPostAuthRedirect,
  legalAiHref,
  safeLegalAiCallback,
} from "@/domain/services/rbac";

const findById = vi.fn();
const findAuthPrincipal = vi.fn();
const rotateActiveSessionIdHash = vi.fn();

vi.mock("@/infrastructure/repositories", () => ({
  userRepository: {
    findById: (...args: unknown[]) => findById(...args),
    findAuthPrincipal: (...args: unknown[]) => findAuthPrincipal(...args),
    rotateActiveSessionIdHash: (...args: unknown[]) =>
      rotateActiveSessionIdHash(...args),
  },
}));

function jwtArgs(overrides: Record<string, unknown>) {
  return {
    token: {},
    user: undefined as never,
    account: null,
    profile: undefined,
    trigger: "update",
    session: undefined,
    ...overrides,
  } as never;
}

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

describe("Legal AI post-auth redirect", () => {
  it("allows CLIENT to return to /legal-ai and rejects open redirects", () => {
    expect(safeLegalAiCallback("/legal-ai")).toBe("/legal-ai");
    expect(safeLegalAiCallback("/legal-ai?q=hello")).toBe("/legal-ai?q=hello");
    expect(safeLegalAiCallback("https://evil.example/legal-ai")).toBeNull();
    expect(safeLegalAiCallback("//evil.example")).toBeNull();
    expect(safeLegalAiCallback("/client/dashboard")).toBeNull();

    expect(getPostAuthRedirect(UserRole.CLIENT, "/legal-ai?q=hi")).toBe(
      "/legal-ai?q=hi",
    );
    expect(getPostAuthRedirect(UserRole.LAWYER, "/legal-ai")).toBe(
      "/lawyer/dashboard",
    );
    expect(getPostAuthRedirect(UserRole.ADMIN, "/legal-ai")).toBe(
      "/admin/dashboard",
    );
    expect(legalAiHref("contract")).toBe("/legal-ai?q=contract");
  });
});

describe("JWT privilege refresh", () => {
  beforeEach(() => {
    findById.mockReset();
    findAuthPrincipal.mockReset();
    rotateActiveSessionIdHash.mockReset();
  });

  it("reloads role and status from the database after the refresh window", async () => {
    const sid = generateActiveSessionId();
    findAuthPrincipal.mockResolvedValue({
      id: "u1",
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
      activeSessionIdHash: hashActiveSessionId(sid),
    });

    const jwt = nodeAuthCallbacks.jwt!;
    const token = await jwt(
      jwtArgs({
        token: {
          id: "u1",
          sid,
          role: UserRole.LAWYER,
          status: UserStatus.ACTIVE,
          statusCheckedAt: Date.now() - PRIVILEGE_REFRESH_MS - 1,
        },
      }),
    );

    expect(findAuthPrincipal).toHaveBeenCalledWith("u1");
    expect(token?.role).toBe(UserRole.CLIENT);
    expect(token?.status).toBe(UserStatus.ACTIVE);
    expect(token?.sid).toBe(sid);
  });

  it("fails closed when the user no longer exists", async () => {
    findAuthPrincipal.mockResolvedValue(null);
    const jwt = nodeAuthCallbacks.jwt!;
    const token = await jwt(
      jwtArgs({
        token: {
          id: "gone",
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          statusCheckedAt: 0,
        },
      }),
    );
    expect(token).toEqual({});
  });
});

describe("JWT single active session", () => {
  beforeEach(() => {
    findById.mockReset();
    findAuthPrincipal.mockReset();
    rotateActiveSessionIdHash.mockReset();
  });

  it("stores the login sid on the JWT and persists its hash", async () => {
    const sid = generateActiveSessionId();
    findAuthPrincipal.mockResolvedValue({
      id: "u1",
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
      activeSessionIdHash: hashActiveSessionId(sid),
    });

    const jwt = nodeAuthCallbacks.jwt!;
    const token = await jwt(
      jwtArgs({
        trigger: "signIn",
        user: {
          id: "u1",
          role: UserRole.CLIENT,
          status: UserStatus.ACTIVE,
          sessionId: sid,
        },
        token: {},
      }),
    );

    expect(token?.sid).toBe(sid);
    expect(rotateActiveSessionIdHash).toHaveBeenCalledWith(
      "u1",
      hashActiveSessionId(sid),
    );
  });

  it("keeps the current session valid and invalidates a previous sid", async () => {
    const oldSid = generateActiveSessionId();
    const newSid = generateActiveSessionId();
    findAuthPrincipal.mockResolvedValue({
      id: "u1",
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
      activeSessionIdHash: hashActiveSessionId(newSid),
    });

    const jwt = nodeAuthCallbacks.jwt!;
    const current = await jwt(
      jwtArgs({
        token: {
          id: "u1",
          sid: newSid,
          role: UserRole.CLIENT,
          status: UserStatus.ACTIVE,
          statusCheckedAt: Date.now(),
        },
      }),
    );
    expect(current?.sessionReplaced).toBeUndefined();
    expect(current?.sid).toBe(newSid);

    const previous = await jwt(
      jwtArgs({
        token: {
          id: "u1",
          sid: oldSid,
          role: UserRole.CLIENT,
          status: UserStatus.ACTIVE,
          statusCheckedAt: Date.now(),
        },
      }),
    );
    expect(previous).toEqual({ sessionReplaced: true });
  });

  it.each([UserRole.CLIENT, UserRole.LAWYER, UserRole.ADMIN] as const)(
    "rejects a replaced %s session",
    async (role) => {
      const oldSid = generateActiveSessionId();
      findAuthPrincipal.mockResolvedValue({
        id: "u1",
        role,
        status: UserStatus.ACTIVE,
        activeSessionIdHash: hashActiveSessionId(generateActiveSessionId()),
      });

      const jwt = nodeAuthCallbacks.jwt!;
      const token = await jwt(
        jwtArgs({
          token: {
            id: "u1",
            sid: oldSid,
            role,
            status: UserStatus.ACTIVE,
            statusCheckedAt: Date.now(),
          },
        }),
      );
      expect(token).toEqual({ sessionReplaced: true });
    },
  );

  it("ignores a client-provided sid on session.update", async () => {
    const sid = generateActiveSessionId();
    findAuthPrincipal.mockResolvedValue({
      id: "u1",
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
      activeSessionIdHash: hashActiveSessionId(sid),
    });

    const jwt = nodeAuthCallbacks.jwt!;
    const token = await jwt(
      jwtArgs({
        trigger: "update",
        session: { sid: "forged-from-client", sessionId: "also-forged" },
        token: {
          id: "u1",
          sid,
          role: UserRole.CLIENT,
          status: UserStatus.ACTIVE,
          statusCheckedAt: Date.now(),
        },
      }),
    );

    expect(token?.sid).toBe(sid);
    expect(token?.sid).not.toBe("forged-from-client");
  });

  it("does not expose the session identifier on the Session object", async () => {
    const sid = generateActiveSessionId();
    const sessionCb = nodeAuthCallbacks.session!;
    const session = (await sessionCb({
      session: {
        user: { id: "u1", email: "a@b.c", role: UserRole.CLIENT, status: UserStatus.ACTIVE },
        expires: new Date(Date.now() + 60_000).toISOString(),
      },
      token: {
        id: "u1",
        sid,
        role: UserRole.CLIENT,
        status: UserStatus.ACTIVE,
      },
    } as never)) as Session;

    expect(session.sessionReplaced).toBeUndefined();
    expect(session.user.id).toBe("u1");
    expect(
      (session.user as { sid?: string }).sid ??
        (session as { sid?: string }).sid,
    ).toBeUndefined();
  });

  it("marks the session replaced without leaking the sid", async () => {
    const sessionCb = nodeAuthCallbacks.session!;
    const session = (await sessionCb({
      session: {
        user: { id: "u1", email: "a@b.c", role: UserRole.CLIENT, status: UserStatus.ACTIVE },
        expires: new Date(Date.now() + 60_000).toISOString(),
      },
      token: { sessionReplaced: true, sid: "should-not-copy" },
    } as never)) as Session;

    expect(session.sessionReplaced).toBe(true);
    expect(session.user.id).toBeUndefined();
    expect((session.user as { sid?: string }).sid).toBeUndefined();
  });
});
