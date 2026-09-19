import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserRole, UserStatus } from "@/domain/enums";
import { canActAsClient } from "@/domain/services/rbac";

/**
 * ADMIN-as-CLIENT access to /client/dashboard only (Admin Surface Switcher).
 *
 * Same defect class and same fix shape as the prior /lawyer/workspace fix:
 * three independent "role must be exactly CLIENT" checks — the /client
 * shell layout, the dashboard page's own guard, and getClientProfileForSession
 * (shared by dashboard/bookings/profile, but bookings and profile keep their
 * own untouched CLIENT-only gate earlier in each file, so widening this
 * shared query is safe — see the wiring tests below).
 *
 * client/bookings, client/profile, client/notifications, and every citizen
 * billing/booking API route are intentionally untouched.
 */

const requirePageSession = vi.fn();
const getSessionUser = vi.fn();
const findById = vi.fn();
const clientProfileFindByUserId = vi.fn();

class RedirectSignal extends Error {
  constructor(public readonly url: string) {
    super(`REDIRECT:${url}`);
  }
}
const redirect = vi.fn((url: string) => {
  throw new RedirectSignal(url);
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));
vi.mock("@/application/common/session", () => ({
  requirePageSession: () => requirePageSession(),
  getSessionUser: () => getSessionUser(),
  lookupAuthSession: vi.fn(),
}));
vi.mock("@/infrastructure/repositories", () => ({
  userRepository: { findById: (...args: unknown[]) => findById(...args) },
  clientProfileRepository: {
    findByUserId: (...args: unknown[]) => clientProfileFindByUserId(...args),
  },
  lawyerProfileRepository: { findByUserId: vi.fn() },
}));
vi.mock("@/infrastructure/storage/file-access", () => ({
  resolveProfilePhotoUrl: vi.fn(),
}));
vi.mock("@/i18n/dashboard-shell-i18n", () => ({
  getShellI18n: vi.fn().mockResolvedValue({
    nav: [],
    shellProps: {},
    dict: { marketplace: { account: {} } },
  }),
}));
vi.mock("@/components/layout/dashboard-shell", () => ({
  DashboardShell: () => null,
  DashboardPageHeading: () => null,
}));

function sessionWithRole(role: UserRole) {
  return {
    user: { id: "u1", role, status: UserStatus.ACTIVE },
    expires: new Date(Date.now() + 60_000).toISOString(),
  };
}

describe("canActAsClient", () => {
  it("allows CLIENT and ADMIN, rejects LAWYER", () => {
    expect(canActAsClient(UserRole.CLIENT)).toBe(true);
    expect(canActAsClient(UserRole.ADMIN)).toBe(true);
    expect(canActAsClient(UserRole.LAWYER)).toBe(false);
  });
});

describe("getClientProfileForSession role gate", () => {
  beforeEach(() => {
    getSessionUser.mockReset();
    findById.mockReset();
    clientProfileFindByUserId.mockReset();
  });

  it("CLIENT succeeds", async () => {
    getSessionUser.mockResolvedValue(sessionWithRole(UserRole.CLIENT));
    findById.mockResolvedValue({ id: "u1", role: UserRole.CLIENT });
    clientProfileFindByUserId.mockResolvedValue(null);

    const { getClientProfileForSession } = await import(
      "@/application/actions/profile-session.queries"
    );
    const result = await getClientProfileForSession();
    expect(result.status).toBe("profile_missing");
  });

  it("ADMIN succeeds (profile_missing, not unauthenticated — the fix)", async () => {
    getSessionUser.mockResolvedValue(sessionWithRole(UserRole.ADMIN));
    findById.mockResolvedValue({ id: "admin-1", role: UserRole.ADMIN });
    clientProfileFindByUserId.mockResolvedValue(null);

    const { getClientProfileForSession } = await import(
      "@/application/actions/profile-session.queries"
    );
    const result = await getClientProfileForSession();
    expect(result.status).toBe("profile_missing");
  });

  it("LAWYER is rejected", async () => {
    getSessionUser.mockResolvedValue(sessionWithRole(UserRole.LAWYER));

    const { getClientProfileForSession } = await import(
      "@/application/actions/profile-session.queries"
    );
    const result = await getClientProfileForSession();
    expect(result.status).toBe("unauthenticated");
    expect(findById).not.toHaveBeenCalled();
  });
});

describe("ClientLayout shell gate", () => {
  beforeEach(() => {
    requirePageSession.mockReset();
    redirect.mockClear();
  });

  it("CLIENT is not redirected", async () => {
    requirePageSession.mockResolvedValue(sessionWithRole(UserRole.CLIENT));
    const ClientLayout = (await import("@/app/client/layout")).default;

    await ClientLayout({ children: null });

    expect(redirect).not.toHaveBeenCalled();
  });

  it("ADMIN is not redirected (the fix)", async () => {
    requirePageSession.mockResolvedValue(sessionWithRole(UserRole.ADMIN));
    const ClientLayout = (await import("@/app/client/layout")).default;

    await ClientLayout({ children: null });

    expect(redirect).not.toHaveBeenCalled();
  });

  it("LAWYER is still redirected to their own dashboard (unchanged)", async () => {
    requirePageSession.mockResolvedValue(sessionWithRole(UserRole.LAWYER));
    const ClientLayout = (await import("@/app/client/layout")).default;

    await expect(ClientLayout({ children: null })).rejects.toMatchObject({
      url: "/lawyer/dashboard",
    });
  });
});

describe("Admin client-dashboard wiring is scoped correctly (source-level)", () => {
  function read(relativePath: string): string {
    return readFileSync(path.join(process.cwd(), relativePath), "utf8");
  }

  it("client/layout.tsx and client/dashboard/page.tsx use canActAsClient", () => {
    expect(read("src/app/client/layout.tsx")).toContain(
      "canActAsClient(session.user.role",
    );
    expect(read("src/app/client/dashboard/page.tsx")).toContain(
      "canActAsClient(session.user.role",
    );
  });

  it("profile-session.queries.ts's client query uses canActAsClient", () => {
    expect(read("src/application/actions/profile-session.queries.ts")).toContain(
      "canActAsClient(session.user.role",
    );
  });

  it("bookings and profile pages keep their own untouched CLIENT-only gate (defense in depth, unaffected by the widened query)", () => {
    const bookings = read("src/app/client/bookings/page.tsx");
    const profile = read("src/app/client/profile/page.tsx");
    const notifications = read("src/app/client/notifications/page.tsx");
    expect(bookings).toContain("session.user.role !== UserRole.CLIENT");
    expect(profile).toContain("session.user.role !== UserRole.CLIENT");
    expect(notifications).toContain("session.user.role !== UserRole.CLIENT");
    expect(bookings).not.toContain("canActAsClient");
    expect(profile).not.toContain("canActAsClient");
    expect(notifications).not.toContain("canActAsClient");
  });

  it("citizen billing API routes still require exactly CLIENT (untouched, no ADMIN widening)", () => {
    const checkout = read("src/app/api/citizen/billing/checkout/route.ts");
    const invoices = read(
      "src/app/api/citizen/billing/invoices/[invoiceId]/route.ts",
    );
    expect(checkout).toContain("requireActor(UserRole.CLIENT)");
    expect(invoices).toContain("requireActor(UserRole.CLIENT)");
    expect(checkout).not.toMatch(/requireActor\(\[.*ADMIN/);
    expect(invoices).not.toMatch(/requireActor\(\[.*ADMIN/);
  });

  it("getLawyerProfileForSession (unrelated) is untouched", () => {
    const source = read(
      "src/application/actions/profile-session.queries.ts",
    );
    expect(source).toContain("session.user.role !== UserRole.LAWYER");
  });
});
