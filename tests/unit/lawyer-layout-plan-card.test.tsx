// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { UserRole } from "@/domain/enums";

const nav = vi.hoisted(() => ({ pathname: "/lawyer/dashboard" }));
const redirectMock = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
);
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  redirect: redirectMock,
}));

const requirePageSession = vi.fn();
const loadState = vi.fn();
vi.mock("@/application/common/session", () => ({ requirePageSession: () => requirePageSession() }));
vi.mock("@/application/use-cases/lawyers/load-lawyer-license-state", () => ({
  loadLawyerLicenseState: (...a: unknown[]) => loadState(...a),
}));
// Partial mock: the workspace frame's import graph needs the other repository exports to exist.
vi.mock("@/infrastructure/repositories", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  notificationRepository: { findByUserId: async () => ({ items: [] }) },
  lawyerProfileRepository: { findByUserId: async () => null },
}));
vi.mock("@/i18n/dashboard-shell-i18n", () => ({
  getShellI18n: async () => ({
    locale: "mn",
    nav: [{ href: "/lawyer/dashboard", label: "Тойм" }],
    dict: { dashboard: { navNotifications: "Мэдэгдэл" }, marketplace: { account: {} } },
    shellProps: { locale: "mn", languageLabel: "Хэл", signOutLabel: "Гарах", brand: "TORE", navAriaLabel: "Үндсэн цэс" },
  }),
}));
vi.mock("@/components/account/account-sharing-banner", () => ({ AccountSharingBanner: () => null }));
vi.mock("@/components/account/device-session-beacon", () => ({ DeviceSessionBeacon: () => null }));

import LawyerLayout from "@/app/lawyer/layout";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver ??= ResizeObserverStub;
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
  }
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  requirePageSession.mockReset();
  loadState.mockReset();
  redirectMock.mockClear();
  fetchMock = vi.fn(async () => json({ planName: "TORE Lawyer", billingRequired: true, subscriptionStatus: "NONE", expiresAt: null, pendingInvoice: null }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const session = (role: UserRole) => ({ user: { id: "u1", role, name: "Тест", email: "t@example.mn", status: "ACTIVE" } });

async function renderLayout(role: UserRole) {
  requirePageSession.mockResolvedValue(session(role));
  render(await LawyerLayout({ children: <div>page content</div> }));
  await screen.findByText("page content");
}

describe("lawyer layout plan card", () => {
  it("REGRESSION: an ADMIN in a lawyer workspace gets no plan card, no licence lookup and no status request", async () => {
    // What the real loader returns for an admin (no lawyer profile): without the role check this null would show the card.
    loadState.mockResolvedValue(null);
    await renderLayout(UserRole.ADMIN);
    expect(screen.queryByTestId("plan-status-card")).toBeNull();
    expect(screen.queryByText("Багцын төлөвийг ачаалж чадсангүй.")).toBeNull();
    expect(loadState).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a LAWYER with no licence flow (licenseState null) still sees their plan status, without a licence line", async () => {
    loadState.mockResolvedValue(null);
    await renderLayout(UserRole.LAWYER);
    expect(await screen.findByTestId("plan-stage")).toBeTruthy();
    expect(screen.getByTestId("plan-stage").textContent).toBe("Өөрийн багц идэвхгүй");
    expect(screen.queryByTestId("license-stage")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/lawyer/billing/status", expect.anything());
  });

  it("an attorney sees both the plan status and the licence stage", async () => {
    loadState.mockResolvedValue("APPROVED");
    await renderLayout(UserRole.LAWYER);
    expect(await screen.findByTestId("plan-stage")).toBeTruthy();
    expect(screen.getByTestId("license-stage").textContent).toBe("Эрх баталгаажсан");
  });

  it("keeps the existing RBAC: a CLIENT is still redirected away from the lawyer workspace", async () => {
    requirePageSession.mockResolvedValue(session(UserRole.CLIENT));
    await expect(LawyerLayout({ children: <div /> })).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(loadState).not.toHaveBeenCalled();
  });
});
