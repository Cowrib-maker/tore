import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserRole, UserStatus } from "@/domain/enums";
import {
  decideActiveSession,
  generateActiveSessionId,
  hashActiveSessionId,
} from "@/domain/services/active-session";

/**
 * P1 hardening milestone — logout does not revoke the server-side active
 * session.
 *
 * Prior state: logoutAction called only `signOut()`, which under the JWT
 * session strategy just clears the client's cookie. `clearActiveSessionIdHash`
 * existed and was correctly implemented but had zero call sites anywhere in
 * the app — a retained copy of a valid JWT kept authenticating until its own
 * expiry, logout or not.
 *
 * Fix (and why `clear`, not `rotate`, would NOT have worked): setting
 * activeSessionIdHash to null does not invalidate a retained JWT — the next
 * time ANY copy of that JWT is presented, nodeAuthCallbacks.jwt's
 * "bind-token" branch (decideActiveSession's `sid present, hash absent`
 * case) silently re-persists that exact sid as the new active hash,
 * re-legitimizing it. Only rotating to a *different*, unpredictable value —
 * the same primitive password-reset already uses — guarantees a retained
 * sid can never match again. These tests prove that end to end.
 */

const auth = vi.fn();
const signOut = vi.fn();
const rotateActiveSessionIdHash = vi.fn();
const findAuthPrincipal = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: (...args: unknown[]) => auth(...args),
  signIn: vi.fn(),
  signOut: (...args: unknown[]) => signOut(...args),
}));

vi.mock("@/infrastructure/repositories", () => ({
  userRepository: {
    rotateActiveSessionIdHash: (...args: unknown[]) =>
      rotateActiveSessionIdHash(...args),
    findAuthPrincipal: (...args: unknown[]) => findAuthPrincipal(...args),
  },
  platformSettingRepository: {},
  unitOfWork: {},
  emailVerificationTokenRepository: {},
}));

describe("logoutAction — server-side session revocation", () => {
  beforeEach(() => {
    auth.mockReset();
    signOut.mockReset().mockResolvedValue(undefined);
    rotateActiveSessionIdHash.mockReset().mockResolvedValue(undefined);
    findAuthPrincipal.mockReset();
  });

  it("rotates the active session hash to a fresh value BEFORE clearing the cookie, when a session exists", async () => {
    auth.mockResolvedValue({ user: { id: "u1", role: UserRole.CLIENT, status: UserStatus.ACTIVE } });
    const callOrder: string[] = [];
    rotateActiveSessionIdHash.mockImplementation(async () => {
      callOrder.push("rotate");
    });
    signOut.mockImplementation(async () => {
      callOrder.push("signOut");
    });

    const { logoutAction } = await import("@/application/actions/auth.actions");
    await logoutAction();

    expect(rotateActiveSessionIdHash).toHaveBeenCalledWith("u1", expect.any(String));
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/login" });
    expect(callOrder).toEqual(["rotate", "signOut"]);
  });

  it("uses a fresh, unpredictable hash — never the same value twice", async () => {
    auth.mockResolvedValue({ user: { id: "u1", role: UserRole.CLIENT, status: UserStatus.ACTIVE } });
    const { logoutAction } = await import("@/application/actions/auth.actions");

    await logoutAction();
    await logoutAction();

    const [, firstHash] = rotateActiveSessionIdHash.mock.calls[0]!;
    const [, secondHash] = rotateActiveSessionIdHash.mock.calls[1]!;
    expect(firstHash).not.toBe(secondHash);
  });

  it("when there is no active session, still calls signOut (idempotent double logout) without attempting revocation", async () => {
    auth.mockResolvedValue(null);

    const { logoutAction } = await import("@/application/actions/auth.actions");
    await logoutAction();

    expect(rotateActiveSessionIdHash).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/login" });
  });

  it("FAILURE MODE — DB revocation throws: signOut still runs (fail-safe fallthrough), and the error does not propagate to the caller", async () => {
    auth.mockResolvedValue({ user: { id: "u1", role: UserRole.CLIENT, status: UserStatus.ACTIVE } });
    rotateActiveSessionIdHash.mockRejectedValue(new Error("db unavailable"));

    const { logoutAction } = await import("@/application/actions/auth.actions");

    await expect(logoutAction()).resolves.toBeUndefined();
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/login" });
  });

  it("FAILURE MODE — signOut throws after a successful DB revocation: the server-side session is already revoked regardless (rotation happened first, and is not rolled back)", async () => {
    auth.mockResolvedValue({ user: { id: "u1", role: UserRole.CLIENT, status: UserStatus.ACTIVE } });
    signOut.mockRejectedValue(new Error("cookie store unavailable"));

    const { logoutAction } = await import("@/application/actions/auth.actions");

    await expect(logoutAction()).rejects.toThrow("cookie store unavailable");
    // The security-relevant side effect already completed before signOut
    // was even called — this is the safe direction to fail in: the account
    // is protected even if the client-side cleanup step errors out.
    expect(rotateActiveSessionIdHash).toHaveBeenCalledWith("u1", expect.any(String));
  });
});

describe("logoutAction — end-to-end proof: a retained JWT cannot authorize future requests after logout", () => {
  beforeEach(() => {
    auth.mockReset();
    signOut.mockReset().mockResolvedValue(undefined);
    rotateActiveSessionIdHash.mockReset();
    findAuthPrincipal.mockReset();
  });

  it("presenting the OLD sid to the real JWT callback after logout returns sessionReplaced, not a usable session", async () => {
    const oldSid = generateActiveSessionId();
    let storedHash = hashActiveSessionId(oldSid); // the session that existed before logout

    auth.mockResolvedValue({ user: { id: "u1", role: UserRole.CLIENT, status: UserStatus.ACTIVE } });
    rotateActiveSessionIdHash.mockImplementation(async (_userId: string, newHash: string) => {
      storedHash = newHash; // simulates the real repository persisting the rotation
    });

    const { logoutAction } = await import("@/application/actions/auth.actions");
    await logoutAction();

    expect(storedHash).not.toBe(hashActiveSessionId(oldSid));

    // Now simulate a retained copy of the pre-logout JWT (still carrying
    // oldSid) being presented on a later request, via the REAL Node auth
    // callback — not a re-implementation of its logic.
    findAuthPrincipal.mockResolvedValue({
      id: "u1",
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
      activeSessionIdHash: storedHash,
    });
    const { nodeAuthCallbacks } = await import(
      "@/infrastructure/auth/auth.callbacks.node"
    );
    const jwt = nodeAuthCallbacks.jwt!;
    const token = await jwt({
      token: {
        id: "u1",
        sid: oldSid,
        role: UserRole.CLIENT,
        status: UserStatus.ACTIVE,
        statusCheckedAt: Date.now(),
      },
      user: undefined as never,
      account: null,
      profile: undefined,
      trigger: "update",
      session: undefined,
    } as never);

    expect(token).toEqual({ sessionReplaced: true });
  });

  it("sanity check on the underlying invariant this fix relies on: decideActiveSession rejects a stale sid against a rotated hash", () => {
    const oldSid = generateActiveSessionId();
    const rotatedHash = hashActiveSessionId(generateActiveSessionId());

    expect(decideActiveSession(oldSid, rotatedHash)).toEqual({ action: "replaced" });
  });

  it("DISPROVES the naive fix: clearing (not rotating) the hash would NOT have revoked a retained sid — it silently re-binds instead", () => {
    const oldSid = generateActiveSessionId();

    // This is what `clearActiveSessionIdHash` alone produces: hash = null.
    const decision = decideActiveSession(oldSid, null);

    // "bind-token", not "replaced" — the retained sid would be accepted and
    // its hash re-persisted as valid on this very request. This is the
    // concrete reason the fix rotates to a fresh random value instead.
    expect(decision).toEqual({ action: "bind-token" });
  });
});
