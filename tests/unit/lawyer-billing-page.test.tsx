// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { UserRole } from "@/domain/enums";

const redirectMock = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
);
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/lawyer/billing",
}));

const requirePageSession = vi.fn();
const loadState = vi.fn();
vi.mock("@/application/common/session", () => ({ requirePageSession: () => requirePageSession() }));
vi.mock("@/application/use-cases/lawyers/load-lawyer-license-state", () => ({
  loadLawyerLicenseState: (...a: unknown[]) => loadState(...a),
}));
vi.mock("@/i18n/get-locale", () => ({ getLocale: async () => "mn" }));

import LawyerBillingPage from "@/app/lawyer/billing/page";
import { BillingCenter } from "@/components/billing/billing-center";

const session = (role: UserRole) => ({ user: { id: "u1", role, status: "ACTIVE" } });
const params = (p: Record<string, string | string[] | undefined> = {}) => ({ searchParams: Promise.resolve(p) });

function findBillingCenter(node: unknown): ReactElement<{ role: string; returnTo: string | null }> | null {
  if (!node || typeof node !== "object") return null;
  const el = node as ReactElement<{ children?: unknown }>;
  if (el.type === BillingCenter) return el as never;
  const children = el.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findBillingCenter(child);
    if (found) return found;
  }
  return null;
}

beforeEach(() => {
  redirectMock.mockClear();
  requirePageSession.mockReset();
  loadState.mockReset().mockResolvedValue("APPROVED");
});

describe("/lawyer/billing page", () => {
  it("sends an ADMIN (admitted by the lawyer layout) to the standalone billing page instead of a broken lawyer billing view", async () => {
    requirePageSession.mockResolvedValue(session(UserRole.ADMIN));
    await expect(LawyerBillingPage(params())).rejects.toThrow("NEXT_REDIRECT:/billing");
    expect(loadState).not.toHaveBeenCalled();
  });

  it("renders the lawyer billing center for a LAWYER with a server-validated returnTo", async () => {
    requirePageSession.mockResolvedValue(session(UserRole.LAWYER));
    const tree = await LawyerBillingPage(params({ returnTo: "/legal-ai?conversationId=c1" }));
    const center = findBillingCenter(tree);
    expect(center?.props.role).toBe("lawyer");
    expect(center?.props.returnTo).toBe("/legal-ai?conversationId=c1");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/legal-ai/../login",
    "/lawyer/%2e%2e/api/auth/signout",
    "/lawyer/billing",
  ])("drops an unsafe returnTo (%s) before it reaches the client component", async (bad) => {
    requirePageSession.mockResolvedValue(session(UserRole.LAWYER));
    const center = findBillingCenter(await LawyerBillingPage(params({ returnTo: bad })));
    expect(center?.props.returnTo).toBeNull();
  });
});
