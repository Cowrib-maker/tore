import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { caseFileErrorResponse } from "@/application/use-cases/case-review/http-error";
import { sessionApiErrorResponse } from "@/application/use-cases/sessions/http-error";
import { UserRole } from "@/domain/enums";
import { SessionReplacedError } from "@/domain/errors/domain-error";
import { loginSchema } from "@/application/validators/auth.schema";
import {
  ACTIVE_SESSION_ID_BYTES,
  SESSION_REPLACED_HINT,
  SESSION_REPLACED_LOGIN_REASON,
  SESSION_REPLACED_MESSAGE,
  activeSessionHashesMatch,
  decideActiveSession,
  generateActiveSessionId,
  hashActiveSessionId,
  isSessionReplacedLoginReason,
  sessionReplacedLoginPath,
} from "@/domain/services/active-session";

describe("active session identifiers", () => {
  it("generates unpredictable 32-byte hex identifiers", () => {
    const ids = new Set(Array.from({ length: 40 }, () => generateActiveSessionId()));
    expect(ids.size).toBe(40);
    for (const id of ids) {
      expect(id).toMatch(/^[a-f0-9]{64}$/);
      expect(id).toHaveLength(ACTIVE_SESSION_ID_BYTES * 2);
      expect(id).not.toBe("u1");
      expect(id).not.toContain("@");
    }
  });

  it("hashes deterministically and compares in constant time", () => {
    const raw = generateActiveSessionId();
    const hash = hashActiveSessionId(raw);
    expect(hash).toHaveLength(64);
    expect(hashActiveSessionId(raw)).toBe(hash);
    expect(activeSessionHashesMatch(hash, hash)).toBe(true);
    expect(activeSessionHashesMatch(hash, hashActiveSessionId("other"))).toBe(
      false,
    );
  });
});

describe("decideActiveSession", () => {
  it("accepts a matching sid and stored hash", () => {
    const sid = generateActiveSessionId();
    expect(decideActiveSession(sid, hashActiveSessionId(sid))).toEqual({
      action: "ok",
    });
  });

  it("rejects a previous sid after the active hash is rotated", () => {
    const oldSid = generateActiveSessionId();
    const newSid = generateActiveSessionId();
    expect(decideActiveSession(oldSid, hashActiveSessionId(newSid))).toEqual({
      action: "replaced",
    });
    expect(decideActiveSession(newSid, hashActiveSessionId(newSid))).toEqual({
      action: "ok",
    });
  });

  it("treats the same sid as valid for shared-browser tabs", () => {
    const sid = generateActiveSessionId();
    const hash = hashActiveSessionId(sid);
    expect(decideActiveSession(sid, hash).action).toBe("ok");
    expect(decideActiveSession(sid, hash).action).toBe("ok");
  });

  it("binds legacy JWTs without a sid when the user has no hash yet", () => {
    expect(decideActiveSession(undefined, null)).toEqual({ action: "bind-new" });
  });

  it("binds a token sid when the stored hash is still null", () => {
    const sid = generateActiveSessionId();
    expect(decideActiveSession(sid, null)).toEqual({ action: "bind-token" });
  });

  it("rejects legacy JWTs after another device has bound a hash", () => {
    expect(
      decideActiveSession(undefined, hashActiveSessionId(generateActiveSessionId())),
    ).toEqual({ action: "replaced" });
  });
});

describe("stale session UX", () => {
  it("uses a Mongolian login reason without exposing session ids", () => {
    expect(SESSION_REPLACED_LOGIN_REASON).toBe("other_device");
    expect(sessionReplacedLoginPath()).toBe("/login?reason=other_device");
    expect(isSessionReplacedLoginReason("other_device")).toBe(true);
    expect(SESSION_REPLACED_MESSAGE).toContain("өөр төхөөрөмжөөс");
    expect(SESSION_REPLACED_HINT).toContain("дахин нэвтэрнэ");
    expect(SESSION_REPLACED_MESSAGE).not.toMatch(/sid|activeSession/i);
  });

  it("returns the Mongolian message from stale API and action mappers", async () => {
    const caseRes = caseFileErrorResponse(new SessionReplacedError());
    const sessionRes = sessionApiErrorResponse(new SessionReplacedError());
    expect(caseRes.status).toBe(401);
    expect(sessionRes.status).toBe(401);
    await expect(caseRes.json()).resolves.toEqual({
      error: SESSION_REPLACED_MESSAGE,
      code: "SESSION_REPLACED",
    });
    await expect(sessionRes.json()).resolves.toEqual({
      error: SESSION_REPLACED_MESSAGE,
      code: "SESSION_REPLACED",
    });
  });
});

describe("client cannot spoof the active session identifier", () => {
  it("strips extra sessionId from login credentials", () => {
    const parsed = loginSchema.safeParse({
      email: "user@example.com",
      password: "Secret1",
      sessionId: "forged-session-id",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({
        email: "user@example.com",
        password: "Secret1",
      });
    }
  });

  it("issues the session id only from authorize, never credentials", () => {
    const config = readFileSync(
      path.join(process.cwd(), "src/infrastructure/auth/auth.config.ts"),
      "utf8",
    );
    expect(config).toContain("generateActiveSessionId()");
    expect(config).toContain("rotateActiveSessionIdHash");
    expect(config).not.toContain("parsed.data.sessionId");
    expect(config).not.toContain("credentials.sessionId");
  });

  it("does not copy sid onto Session.user", () => {
    const node = readFileSync(
      path.join(process.cwd(), "src/infrastructure/auth/auth.callbacks.node.ts"),
      "utf8",
    );
    const edge = readFileSync(
      path.join(process.cwd(), "src/infrastructure/auth/auth.callbacks.ts"),
      "utf8",
    );
    expect(node).not.toContain("session.user.sid");
    expect(edge).not.toContain("session.user.sid");
    expect(node).toContain("Never copy sid/sessionId from session.update");
  });
});

describe("single-session enforcement wiring", () => {
  it("rejects stale sessions in requireActor, layouts, and Legal AI", () => {
    const requireActor = readFileSync(
      path.join(process.cwd(), "src/application/common/require-actor.ts"),
      "utf8",
    );
    const session = readFileSync(
      path.join(process.cwd(), "src/application/common/session.ts"),
      "utf8",
    );
    const chat = readFileSync(
      path.join(process.cwd(), "src/app/api/ai/chat/route.ts"),
      "utf8",
    );
    const entitlement = readFileSync(
      path.join(process.cwd(), "src/app/api/ai/entitlement/route.ts"),
      "utf8",
    );
    const clientLayout = readFileSync(
      path.join(process.cwd(), "src/app/client/layout.tsx"),
      "utf8",
    );
    const lawyerLayout = readFileSync(
      path.join(process.cwd(), "src/app/lawyer/layout.tsx"),
      "utf8",
    );
    const adminLayout = readFileSync(
      path.join(process.cwd(), "src/app/admin/layout.tsx"),
      "utf8",
    );
    const legalAi = readFileSync(
      path.join(process.cwd(), "src/app/legal-ai/page.tsx"),
      "utf8",
    );
    const loginForm = readFileSync(
      path.join(process.cwd(), "src/components/auth/login-form.tsx"),
      "utf8",
    );

    expect(requireActor).toContain("SessionReplacedError");
    expect(session).toContain("sessionReplaced");
    expect(session).toContain("signOut");
    expect(chat).toContain("SessionReplacedError");
    expect(chat).not.toMatch(/requireActor\(\)\.catch\(\(\) => null\)/);
    expect(entitlement).toContain("lookup.replaced");
    expect(clientLayout).toContain("requirePageSession");
    expect(lawyerLayout).toContain("requirePageSession");
    expect(adminLayout).toContain("requirePageSession");
    expect(legalAi).toContain("sessionReplacedLoginPath");
    expect(loginForm).toContain("copy.sessionReplaced");
  });

  it("keeps email verification from rotating the active session", () => {
    const verification = readFileSync(
      path.join(process.cwd(), "src/application/use-cases/auth/email-verification.ts"),
      "utf8",
    );
    const logout = readFileSync(
      path.join(process.cwd(), "src/application/actions/auth.actions.ts"),
      "utf8",
    );
    expect(verification).not.toContain("rotateActiveSessionIdHash");
    expect(verification).not.toContain("clearActiveSessionIdHash");
    expect(logout).toContain("export async function logoutAction");
    expect(logout).toContain('signOut({ redirectTo: "/login" })');
  });

  it("covers citizen, lawyer, and admin app shells", () => {
    expect(UserRole.CLIENT).toBe("CLIENT");
    expect(UserRole.LAWYER).toBe("LAWYER");
    expect(UserRole.ADMIN).toBe("ADMIN");
  });
});
