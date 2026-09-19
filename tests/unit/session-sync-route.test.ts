import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { NextRequest } from "next/server";
import { decode, encode } from "@auth/core/jwt";

import { UserRole, UserStatus } from "@/domain/enums";
import { hashActiveSessionId } from "@/domain/services/active-session";
import { POST } from "@/app/api/session/sync/route";

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

// The sync route only exercises the JWT-strategy path. Mocking the Prisma
// client avoids constructing a real database pool at import time.
vi.mock("@/infrastructure/database/prisma", () => ({ prisma: {} }));

const SESSION_COOKIE_NAME = "authjs.session-token";
const rawAuthSecret = process.env.AUTH_SECRET;
if (!rawAuthSecret) {
  throw new Error("AUTH_SECRET must be set for session-sync-route.test.ts");
}
const AUTH_SECRET: string = rawAuthSecret;

function signToken(token: Record<string, unknown>) {
  return encode({ token, secret: AUTH_SECRET, salt: SESSION_COOKIE_NAME });
}

type RouteContext = { params: Promise<Record<string, string>> };
const routeContext: RouteContext = { params: Promise.resolve({}) };

async function post(request: NextRequest): Promise<Response> {
  const response = await POST(request, routeContext);
  if (!response) {
    throw new Error("expected the sync route to return a Response");
  }
  return response;
}

function requestWithCookie(cookie?: string) {
  return new NextRequest("http://localhost:3000/api/session/sync", {
    method: "POST",
    headers: {
      host: "localhost:3000",
      // Forces non-secure cookie names (plain "authjs.session-token" rather
      // than "__Secure-authjs.session-token") so this matches SESSION_COOKIE_NAME.
      "x-forwarded-proto": "http",
      ...(cookie ? { cookie } : {}),
    },
  });
}

function sessionTokenCookies(response: Response) {
  return response.headers
    .getSetCookie()
    .filter((header) => header.startsWith(`${SESSION_COOKIE_NAME}=`));
}

describe("POST /api/session/sync", () => {
  beforeEach(() => {
    findById.mockReset();
    findAuthPrincipal.mockReset();
    rotateActiveSessionIdHash.mockReset();
  });

  it("uses the cookie-forwarding wrapper form, not the RSC zero-arg form", async () => {
    // The whole point of this route is to be the one place `auth()` is
    // invoked in a form that forwards Set-Cookie. A regression back to
    // `await auth()` (the RSC form used everywhere else) would silently
    // reintroduce the defect without any other test noticing, since a bare
    // `auth()` call still "works" — it just drops the refreshed cookie.
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(
        new URL(
          "../../src/app/api/session/sync/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(source).toContain("export const POST = auth(");
    expect(source).not.toContain("await auth()");
  });

  it("is a no-op for a guest request (no session cookie)", async () => {
    const response = await post(requestWithCookie());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    // A guest still gets default CSRF/callback-url cookies from next-auth's
    // session action (unrelated, pre-existing library behavior on every
    // session check) — the invariant this route must uphold is that no
    // session-token cookie is minted out of thin air for a guest.
    expect(sessionTokenCookies(response)).toEqual([]);
    expect(rotateActiveSessionIdHash).not.toHaveBeenCalled();
  });

  it("forwards the refreshed cookie when decideActiveSession binds a legacy token", async () => {
    // Legacy/never-bound token: no `sid`, and the DB hash is still null ->
    // decideActiveSession resolves "bind-new". This is exactly the shape
    // that, called from a Server Component, mutates the DB and strands the
    // browser on a stale cookie (see the auth-role-freshness.test.ts
    // regression test for that failure mode in isolation).
    findAuthPrincipal.mockResolvedValue({
      id: "u1",
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
      activeSessionIdHash: null,
    });

    const staleCookie = await signToken({
      id: "u1",
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
      statusCheckedAt: Date.now(),
    });

    const response = await post(
      requestWithCookie(`${SESSION_COOKIE_NAME}=${staleCookie}`),
    );

    expect(rotateActiveSessionIdHash).toHaveBeenCalledTimes(1);
    const [, rotatedHash] = rotateActiveSessionIdHash.mock.calls[0] as [
      string,
      string,
    ];

    const sessionCookie = sessionTokenCookies(response)[0];
    expect(sessionCookie).toBeDefined();

    const cookieValue = decodeURIComponent(
      sessionCookie!.split(";")[0]!.slice(`${SESSION_COOKIE_NAME}=`.length),
    );
    const refreshedToken = await decode({
      token: cookieValue,
      secret: AUTH_SECRET,
      salt: SESSION_COOKIE_NAME,
    });

    // The cookie the browser actually receives now carries the same sid the
    // DB was just rotated to — the fix's core guarantee.
    expect(typeof refreshedToken?.sid).toBe("string");
    expect(hashActiveSessionId(refreshedToken!.sid as string)).toBe(
      rotatedHash,
    );
  });

  it("still rejects a genuinely replaced session (no security regression)", async () => {
    // A real second-device login: the DB hash belongs to a different sid
    // than the one in this cookie. The sync route must resolve this exactly
    // like every other auth() call site — session replaced, not bound.
    findAuthPrincipal.mockResolvedValue({
      id: "u1",
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
      activeSessionIdHash: hashActiveSessionId("some-other-device-sid"),
    });

    const oldCookie = await signToken({
      id: "u1",
      sid: "this-devices-old-sid",
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
      statusCheckedAt: Date.now(),
    });

    const response = await post(
      requestWithCookie(`${SESSION_COOKIE_NAME}=${oldCookie}`),
    );

    // The route handler's own JSON body never reflects session state (it
    // always returns { ok: true } — see the route's implementation), so the
    // security-relevant assertion is on the DB write and the actual cookie
    // next-auth's session refresh forwards.
    expect(rotateActiveSessionIdHash).not.toHaveBeenCalled();

    const sessionCookie = sessionTokenCookies(response)[0];
    expect(sessionCookie).toBeDefined();
    const cookieValue = decodeURIComponent(
      sessionCookie!.split(";")[0]!.slice(`${SESSION_COOKIE_NAME}=`.length),
    );
    const replacedToken = await decode({
      token: cookieValue,
      secret: AUTH_SECRET,
      salt: SESSION_COOKIE_NAME,
    });
    expect(replacedToken?.sessionReplaced).toBe(true);
    expect(replacedToken?.sid).toBeUndefined();
  });
});
