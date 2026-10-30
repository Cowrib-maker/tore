import { describe, expect, it } from "vitest";

import { CookieJar, loginUser } from "./qpay-sandbox-helpers";

/**
 * Proves, against a REAL deployed URL (not a mock, not a unit test render),
 * that /legal-ai actually serves the Lawyer Workspace to a LAWYER session
 * and the citizen chat to everyone else. The role-branch logic itself was
 * already proven correct at the unit level (legal-ai-page-role-routing.test.ts,
 * covering LAWYER/CLIENT/ADMIN/anonymous), but no test until now exercised
 * the real, deployed HTTP response — the actual gap behind repeated reports
 * of "the user still sees the citizen chat" (every prior manual check used
 * an ADMIN account, for which the citizen chat IS the correct, by-design
 * response; this test is the first to check an actual LAWYER session).
 *
 * Pure HTTP — no browser, no Prisma/database writes (the account already
 * exists, provisioned by active-session.e2e.test.ts's ensureUser), and a
 * private, process-local cookie jar — so it never touches any other
 * session, including an operator's own browser-authenticated ADMIN session.
 */
const BASE_URL = (
  process.env.TORE_E2E_BASE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000"
).replace(/\/+$/, "");

// Matches tests/e2e/active-session.e2e.test.ts's ensureUser("lawyer") fixture
// email-building convention exactly (that file provisions the account via
// an idempotent upsert). The password is deliberately NOT duplicated as a
// literal here — read it from the environment so this file never contains
// a credential-shaped string; see that file's own `ensureUser` for the
// fixture's actual value.
const LAWYER_TEST_EMAIL = "session-e2e-lawyer@tore.test";
const LAWYER_TEST_PASSWORD = process.env.TORE_E2E_LAWYER_TEST_PASSWORD;

// When this deployment sits behind Vercel Deployment Protection (SSO wall),
// a plain unauthenticated fetch is redirected to Vercel's own login page
// instead of reaching the app. `vercel env run` / `vercel link` supplies this
// token locally; never log or persist its value.
function vercelProtectionHeaders(): Record<string, string> {
  const token = process.env.VERCEL_OIDC_TOKEN;
  return token ? { "x-vercel-trusted-oidc-idp-token": token } : {};
}

async function fetchPage(jar: CookieJar, path: string) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { cookie: jar.header(), ...vercelProtectionHeaders() },
    redirect: "manual",
  });
  jar.absorb(response.headers);
  const text = await response.text();
  const location = response.headers.get("location");
  return { status: response.status, text, location };
}

describe("/legal-ai and /lawyer/workspace role routing (real deployed HTTP)", () => {
  // Skips (not fails) when TORE_E2E_LAWYER_TEST_PASSWORD isn't supplied,
  // e.g. in a normal CI run that doesn't set it — see the constant above.
  it.skipIf(!LAWYER_TEST_PASSWORD)(
    "an authenticated LAWYER session actually receives the Lawyer Workspace markup at /legal-ai, not the citizen landing page",
    async () => {
      const jar = await loginUser(BASE_URL, LAWYER_TEST_EMAIL, LAWYER_TEST_PASSWORD!);
      const page = await fetchPage(jar, "/legal-ai");

      expect(page.status).toBe(200);
      // LawyerWorkspaceFrame/LawyerAiWorkbench markers — never present for the
      // citizen LegalAiChat branch.
      expect(page.text).toContain("TORE Legal Chat");
      // The citizen-only landing heading must be absent for this session.
      expect(page.text).not.toContain("Танд юу тохиолдсон бэ?");
    },
  );

  it.skipIf(!LAWYER_TEST_PASSWORD)(
    "the same LAWYER session can load /lawyer/workspace directly",
    async () => {
      const jar = await loginUser(BASE_URL, LAWYER_TEST_EMAIL, LAWYER_TEST_PASSWORD!);
      const page = await fetchPage(jar, "/lawyer/workspace");
      expect(page.status).toBe(200);
    },
  );

  // The actual post-login redirect: middleware bounces an authenticated
  // visitor away from /login via getPostAuthRedirect — this is the literal,
  // browser-observable "where does a LAWYER land after signing in" behavior,
  // not just the pure function checked at the unit level (rbac.ts /
  // auth-role-freshness.test.ts).
  it.skipIf(!LAWYER_TEST_PASSWORD)(
    "an authenticated LAWYER visiting /login is redirected to /lawyer/workspace, not the old marketplace dashboard",
    async () => {
      const jar = await loginUser(BASE_URL, LAWYER_TEST_EMAIL, LAWYER_TEST_PASSWORD!);
      const page = await fetchPage(jar, "/login");
      expect(page.status).toBeGreaterThanOrEqual(300);
      expect(page.status).toBeLessThan(400);
      expect(page.location).toBeTruthy();
      // Location is an absolute URL (new URL(path, req.nextUrl) in
      // middleware.ts) — compare only the path.
      expect(new URL(page.location!, BASE_URL).pathname).toBe("/lawyer/workspace");
    },
  );

  it("an anonymous (unauthenticated) visitor still gets the citizen landing page at /legal-ai — the public flow is unchanged", async () => {
    const jar = new CookieJar();
    const page = await fetchPage(jar, "/legal-ai");
    expect(page.status).toBe(200);
    expect(page.text).toContain("Танд юу тохиолдсон бэ?");
  });
});
