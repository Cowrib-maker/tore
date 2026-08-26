import bcrypt from "bcryptjs";
import { afterAll, describe, expect, it } from "vitest";

import { UserRole, UserStatus } from "@/domain/enums";
import { SESSION_REPLACED_MESSAGE } from "@/domain/services/active-session";
import { prisma } from "@/infrastructure/database/prisma";

import { CookieJar, loginUser } from "./qpay-sandbox-helpers";

const BASE_URL = (
  process.env.TORE_E2E_BASE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000"
).replace(/\/+$/, "");

async function ensureUser(role: UserRole, localPart: string, name: string) {
  const email = `session-e2e-${localPart}@tore.test`;
  const password = "SessionE2e1";
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findFirst({
    where: { email, deletedAt: null },
  });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        role,
        status: UserStatus.ACTIVE,
        passwordHash,
        emailVerified: existing.emailVerified ?? new Date(),
      },
    });
    return { email, password };
  }
  await prisma.user.create({
    data: {
      email,
      name,
      role,
      status: UserStatus.ACTIVE,
      passwordHash,
      emailVerified: new Date(),
      preferredLanguage: "mn",
    },
  });
  return { email, password };
}

async function fetchPage(jar: CookieJar, path: string) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { cookie: jar.header() },
    redirect: "manual",
  });
  jar.absorb(response.headers);
  const location = response.headers.get("location");
  const text = await response.text();
  return { status: response.status, location, text };
}

describe("single active device session E2E", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("invalidates a citizen session on another device and keeps the new one", async () => {
    const user = await ensureUser(UserRole.CLIENT, "citizen", "Session E2E Citizen");
    const deviceA = await loginUser(BASE_URL, user.email, user.password);
    const before = await fetchPage(deviceA, "/client/dashboard");
    expect(before.status).toBe(200);
    expect(before.text).not.toContain(SESSION_REPLACED_MESSAGE);

    const deviceB = await loginUser(BASE_URL, user.email, user.password);
    const afterA = await fetchPage(deviceA, "/client/dashboard");
    expect(afterA.status).toBeGreaterThanOrEqual(300);
    expect(afterA.status).toBeLessThan(400);
    expect(afterA.location ?? "").toContain("/login?reason=other_device");

    const loginPage = await fetchPage(deviceA, "/login?reason=other_device");
    expect(loginPage.status).toBe(200);
    expect(loginPage.text).toContain(SESSION_REPLACED_MESSAGE);
    expect(loginPage.text).not.toMatch(/authjs\.session-token|sid=/);

    const afterB = await fetchPage(deviceB, "/client/dashboard");
    expect(afterB.status).toBe(200);
    expect(afterB.text).not.toContain(SESSION_REPLACED_MESSAGE);

    const staleApi = await fetch(`${BASE_URL}/api/ai/entitlement`, {
      headers: { cookie: deviceA.header() },
      redirect: "manual",
    });
    expect(staleApi.status).toBe(401);
    const staleJson = (await staleApi.json()) as { error?: string; code?: string };
    expect(staleJson.code).toBe("SESSION_REPLACED");
    expect(staleJson.error).toBe(SESSION_REPLACED_MESSAGE);
    expect(JSON.stringify(staleJson)).not.toMatch(/activeSessionIdHash|"sid"/);

    const freshApi = await fetch(`${BASE_URL}/api/ai/entitlement`, {
      headers: { cookie: deviceB.header() },
      redirect: "manual",
    });
    expect(freshApi.status).toBe(200);
  });

  it("invalidates a lawyer session on another device including Legal AI", async () => {
    const user = await ensureUser(UserRole.LAWYER, "lawyer", "Session E2E Lawyer");
    const deviceA = await loginUser(BASE_URL, user.email, user.password);
    const workspace = await fetchPage(deviceA, "/lawyer/workspace");
    expect(workspace.status).toBe(200);

    const deviceB = await loginUser(BASE_URL, user.email, user.password);
    const staleWorkspace = await fetchPage(deviceA, "/lawyer/workspace");
    expect(staleWorkspace.location ?? "").toContain("/login?reason=other_device");

    const staleLegalAi = await fetchPage(deviceA, "/legal-ai");
    expect(staleLegalAi.location ?? "").toContain("/login?reason=other_device");

    const freshWorkspace = await fetchPage(deviceB, "/lawyer/workspace");
    expect(freshWorkspace.status).toBe(200);
    const freshLegalAi = await fetchPage(deviceB, "/legal-ai");
    expect(freshLegalAi.status).toBe(200);
    expect(freshLegalAi.location ?? "").not.toContain("reason=other_device");
  });

  it("keeps two requests that share the same cookie valid", async () => {
    const user = await ensureUser(UserRole.CLIENT, "tabs", "Session E2E Tabs");
    const jar = await loginUser(BASE_URL, user.email, user.password);
    const tabOne = await fetchPage(jar, "/client/dashboard");
    const tabTwo = await fetchPage(jar, "/client/profile");
    expect(tabOne.status).toBe(200);
    expect(tabTwo.status).toBe(200);
  });
});
