import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserRole, UserStatus } from "@/domain/enums";
import { canActAsLawyer } from "@/domain/services/rbac";

/**
 * ADMIN-as-LAWYER access to the /lawyer/workspace surface.
 *
 * Root cause (see prior investigation): three independent layers each
 * hardcoded "role must be exactly LAWYER" — the /lawyer shell layout,
 * requireActor's single-role check, and loadLawyerWorkspaceHome's own
 * guard — none aware of canAccessRoute's existing "ADMIN reaches every
 * route" policy. Fixed narrowly: a shared canActAsLawyer(role) predicate,
 * applied only at the workspace surface's own gates. Ownership checks
 * (assertLawyerReviewer / requireOwnedCaseFile, shared with lawyer-only
 * APIs outside this workspace) are intentionally untouched.
 *
 * All module mocks live at the top of this file (vi.mock is hoisted and
 * file-scoped in Vitest — declaring the same module path twice in one
 * file, even in different describe blocks, would have the second
 * declaration silently win).
 */

const requirePageSession = vi.fn();
const lookupAuthSession = vi.fn();
const findById = vi.fn();

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
  lookupAuthSession: (...args: unknown[]) => lookupAuthSession(...args),
  getSessionUser: vi.fn(),
}));
vi.mock("@/infrastructure/repositories", () => ({
  userRepository: {
    findById: (...args: unknown[]) => findById(...args),
  },
}));
vi.mock("@/i18n/dashboard-shell-i18n", () => ({
  getShellI18n: vi.fn().mockResolvedValue({
    nav: [],
    shellProps: {},
    dict: { marketplace: { account: {} } },
  }),
}));
vi.mock("@/components/layout/lawyer-app-chrome", () => ({
  LawyerAppChrome: () => null,
}));
vi.mock("@/components/account/account-sharing-banner", () => ({
  AccountSharingBanner: () => null,
}));
vi.mock("@/components/account/device-session-beacon", () => ({
  DeviceSessionBeacon: () => null,
}));

describe("canActAsLawyer", () => {
  it("allows LAWYER and ADMIN, rejects CLIENT", () => {
    expect(canActAsLawyer(UserRole.LAWYER)).toBe(true);
    expect(canActAsLawyer(UserRole.ADMIN)).toBe(true);
    expect(canActAsLawyer(UserRole.CLIENT)).toBe(false);
  });
});

describe("loadLawyerWorkspaceHome role gate", () => {
  function emptyDeps() {
    return {
      repository: { listByOwnerLawyerId: vi.fn().mockResolvedValue([]) },
      store: {
        listOwnedRecentConversations: vi.fn().mockResolvedValue([]),
        listOwnedCaseConversations: vi.fn().mockResolvedValue([]),
      },
    } as never;
  }

  it("LAWYER succeeds", async () => {
    const { loadLawyerWorkspaceHome } = await import(
      "@/application/use-cases/case-review/load-lawyer-workspace-home"
    );
    const view = await loadLawyerWorkspaceHome(
      { userId: "lawyer-1", role: UserRole.LAWYER },
      emptyDeps(),
    );
    expect(view.cases).toEqual([]);
  });

  it("ADMIN succeeds and sees the (empty, since they own no cases) workspace", async () => {
    const { loadLawyerWorkspaceHome } = await import(
      "@/application/use-cases/case-review/load-lawyer-workspace-home"
    );
    const view = await loadLawyerWorkspaceHome(
      { userId: "admin-1", role: UserRole.ADMIN },
      emptyDeps(),
    );
    expect(view.cases).toEqual([]);
    expect(view.summary.caseCount).toBe(0);
  });

  it("CLIENT is rejected", async () => {
    const { loadLawyerWorkspaceHome } = await import(
      "@/application/use-cases/case-review/load-lawyer-workspace-home"
    );
    await expect(
      loadLawyerWorkspaceHome(
        { userId: "client-1", role: UserRole.CLIENT },
        emptyDeps(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("LawyerLayout shell gate", () => {
  beforeEach(() => {
    requirePageSession.mockReset();
    redirect.mockClear();
  });

  function sessionWithRole(role: UserRole) {
    return {
      user: { id: "u1", role, status: UserStatus.ACTIVE },
      expires: new Date(Date.now() + 60_000).toISOString(),
    };
  }

  it("LAWYER is not redirected", async () => {
    requirePageSession.mockResolvedValue(sessionWithRole(UserRole.LAWYER));
    const LawyerLayout = (await import("@/app/lawyer/layout")).default;

    await LawyerLayout({ children: null });

    expect(redirect).not.toHaveBeenCalled();
  });

  it("ADMIN is not redirected (the fix)", async () => {
    requirePageSession.mockResolvedValue(sessionWithRole(UserRole.ADMIN));
    const LawyerLayout = (await import("@/app/lawyer/layout")).default;

    await LawyerLayout({ children: null });

    expect(redirect).not.toHaveBeenCalled();
  });

  it("CLIENT is redirected to their own dashboard", async () => {
    requirePageSession.mockResolvedValue(sessionWithRole(UserRole.CLIENT));
    const LawyerLayout = (await import("@/app/lawyer/layout")).default;

    await expect(LawyerLayout({ children: null })).rejects.toMatchObject({
      url: "/client/dashboard",
    });
  });
});

describe("requireActor(UserRole.LAWYER) (single-role form, unchanged) still rejects ADMIN", () => {
  beforeEach(() => {
    lookupAuthSession.mockReset();
    findById.mockReset();
  });

  it("an ADMIN calling a LAWYER-only endpoint's single-role requireActor is still forbidden", async () => {
    lookupAuthSession.mockResolvedValue({
      session: {
        user: { id: "admin-1", role: UserRole.ADMIN, status: UserStatus.ACTIVE },
        expires: new Date(Date.now() + 60_000).toISOString(),
      },
      replaced: false,
    });
    findById.mockResolvedValue({
      id: "admin-1",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });

    const { requireActor } = await import("@/application/common/require-actor");

    await expect(requireActor(UserRole.LAWYER)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("Lawyer Workspace surface wiring (source-level)", () => {
  function read(relativePath: string): string {
    return readFileSync(path.join(process.cwd(), relativePath), "utf8");
  }

  const workspacePages = [
    "src/app/lawyer/workspace/page.tsx",
    "src/app/lawyer/workspace/cases/page.tsx",
    "src/app/lawyer/workspace/case-review/page.tsx",
    "src/app/lawyer/workspace/case-review/analyze/page.tsx",
    "src/app/lawyer/workspace/case-review/draft/page.tsx",
    "src/app/lawyer/workspace/case-review/timeline/page.tsx",
  ];

  it.each(workspacePages)(
    "%s allows [LAWYER, ADMIN], not LAWYER alone",
    (file) => {
      const source = read(file);
      expect(source).toContain(
        "requireActor([UserRole.LAWYER, UserRole.ADMIN])",
      );
      expect(source).not.toMatch(/requireActor\(UserRole\.LAWYER\)/);
    },
  );

  it("case-review.actions.ts (the workspace's own Server Actions, used nowhere else) allows [LAWYER, ADMIN] everywhere", () => {
    const source = read("src/application/actions/case-review.actions.ts");
    const singleRoleCalls = source.match(/requireActor\(UserRole\.LAWYER\)/g);
    const arrayCalls = source.match(
      /requireActor\(\[UserRole\.LAWYER, UserRole\.ADMIN\]\)/g,
    );
    expect(singleRoleCalls).toBeNull();
    expect(arrayCalls?.length).toBeGreaterThanOrEqual(13);
  });

  it("src/app/lawyer/layout.tsx uses canActAsLawyer, not a raw role equality check", () => {
    const source = read("src/app/lawyer/layout.tsx");
    expect(source).toContain("canActAsLawyer(session.user.role");
    expect(source).not.toContain("session.user.role !== UserRole.LAWYER");
  });

  it("load-lawyer-workspace-home.ts uses canActAsLawyer", () => {
    const source = read(
      "src/application/use-cases/case-review/load-lawyer-workspace-home.ts",
    );
    expect(source).toContain("canActAsLawyer(actor.role)");
  });
});

describe("unrelated LAWYER-only surfaces are untouched (no global ADMIN widening)", () => {
  function read(relativePath: string): string {
    return readFileSync(path.join(process.cwd(), relativePath), "utf8");
  }

  const excludedFiles = [
    "src/app/api/lawyer/billing/route.ts",
    "src/app/api/lawyer/billing/checkout/route.ts",
    "src/app/api/lawyer/sessions/route.ts",
    "src/app/api/lawyer/sessions/touch/route.ts",
    "src/app/api/lawyer/sessions/revoke-others/route.ts",
    "src/app/api/lawyer/ai/documents/route.ts",
    "src/app/api/lawyer/case-review/route.ts",
    "src/app/api/lawyer/case-review/rerun/route.ts",
  ];

  it.each(excludedFiles)(
    "%s still requires exactly LAWYER (ADMIN not implicitly granted)",
    (file) => {
      const source = read(file);
      expect(source).toContain("requireActor(UserRole.LAWYER)");
      expect(source).not.toContain(
        "requireActor([UserRole.LAWYER, UserRole.ADMIN])",
      );
    },
  );

  it("the shared ownership assertions (assertLawyerReviewer, requireOwnedCaseFile, assertOwnedCaseFileForAi) are untouched — still LAWYER-only", () => {
    const assertAccess = read(
      "src/application/use-cases/case-review/assert-access.ts",
    );
    const caseConversations = read(
      "src/application/use-cases/case-review/case-conversations.ts",
    );
    expect(assertAccess).toContain("actor.role !== UserRole.LAWYER");
    expect(caseConversations).toContain("actor.role !== UserRole.LAWYER");
    expect(assertAccess).not.toContain("canActAsLawyer");
    expect(caseConversations).not.toContain("canActAsLawyer");
  });
});
