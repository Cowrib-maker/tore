import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /legal-ai is the single canonical destination for every "open AI chat"
 * entry point in the app: the Lawyer Workspace's "TORE Legal Chat" launcher
 * card, the sidebar "Legal AI" nav item (both client and lawyer shells), and
 * direct navigation. This test exercises the page function itself (same
 * pattern as organizations-pages-access-order.test.ts) to pin down, with
 * proof rather than assumption, which component each session role actually
 * gets — the exact question raised by a screenshot showing the legacy
 * citizen landing page after what looked like a lawyer-workspace action.
 */
const lookupAuthSession = vi.fn();
const loadLawyerLicenseState = vi.fn();
const loadLawyerAiWorkbench = vi.fn();
const getShellI18n = vi.fn();

vi.mock("@/application/common/session", () => ({
  lookupAuthSession: (...args: unknown[]) => lookupAuthSession(...args),
}));
vi.mock("@/application/use-cases/lawyers/load-lawyer-license-state", () => ({
  loadLawyerLicenseState: (...args: unknown[]) => loadLawyerLicenseState(...args),
}));
vi.mock("@/application/use-cases/ai/load-lawyer-ai-workbench", () => ({
  loadLawyerAiWorkbench: (...args: unknown[]) => loadLawyerAiWorkbench(...args),
}));
vi.mock("@/i18n/get-dictionary", () => ({
  getDictionary: async () => ({
    common: { signIn: "Нэвтрэх", getStarted: "Эхлэх" },
    dashboard: { navDashboard: "Хяналтын самбар" },
  }),
}));
vi.mock("@/i18n/dashboard-shell-i18n", () => ({
  getShellI18n: (...args: unknown[]) => getShellI18n(...args),
}));

import LegalAiPage from "@/app/legal-ai/page";
import { LawyerWorkspaceFrame } from "@/components/case-review/lawyer-workspace-frame";
import { LawyerAiWorkbench } from "@/components/legal-ai/lawyer-ai-workbench";
import { LegalAiChat } from "@/components/legal-ai/legal-ai-chat";
import { UserRole } from "@/domain/enums";

function searchParams(params: Record<string, string> = {}) {
  return Promise.resolve(params);
}

function sessionFor(role: UserRole) {
  return {
    session: { user: { id: `${role}-1`, role, email: `${role.toLowerCase()}@example.mn` } },
    replaced: false,
  };
}

beforeEach(() => {
  for (const m of [lookupAuthSession, loadLawyerLicenseState, loadLawyerAiWorkbench, getShellI18n]) {
    m.mockReset();
  }
  loadLawyerLicenseState.mockResolvedValue({ status: "VERIFIED" });
  loadLawyerAiWorkbench.mockResolvedValue({
    conversationId: undefined,
    caseFileId: undefined,
    caseContext: null,
    history: [],
  });
  getShellI18n.mockResolvedValue({
    locale: "mn",
    shellProps: { languageLabel: "MN", signOutLabel: "Гарах" },
  });
});

describe("/legal-ai role routing", () => {
  it("an authenticated LAWYER gets the improved LawyerAiWorkbench inside LawyerWorkspaceFrame, not the citizen landing", async () => {
    lookupAuthSession.mockResolvedValue(sessionFor(UserRole.LAWYER));

    const element = (await LegalAiPage({
      searchParams: searchParams(),
    })) as { type: unknown; props: { children: { type: unknown } } };

    expect(element.type).toBe(LawyerWorkspaceFrame);
    expect(element.props.children.type).toBe(LawyerAiWorkbench);
    expect(loadLawyerAiWorkbench).toHaveBeenCalledTimes(1);
  });

  it("a CLIENT never receives the lawyer-only workbench — gets the legacy citizen LegalAiChat", async () => {
    lookupAuthSession.mockResolvedValue(sessionFor(UserRole.CLIENT));

    const element = (await LegalAiPage({ searchParams: searchParams() })) as { type: unknown };

    expect(element.type).toBe(LegalAiChat);
    expect(loadLawyerAiWorkbench).not.toHaveBeenCalled();
  });

  it("an anonymous visitor (no session) gets the legacy citizen LegalAiChat — the public landing page is unchanged", async () => {
    lookupAuthSession.mockResolvedValue({ session: null, replaced: false });

    const element = (await LegalAiPage({ searchParams: searchParams() })) as { type: unknown };

    expect(element.type).toBe(LegalAiChat);
    expect(loadLawyerAiWorkbench).not.toHaveBeenCalled();
    expect(loadLawyerLicenseState).not.toHaveBeenCalled();
  });

  it("an ADMIN also gets the citizen LegalAiChat — lawyer-only UI is never forced on a role that isn't LAWYER (documents current, unchanged behaviour)", async () => {
    lookupAuthSession.mockResolvedValue(sessionFor(UserRole.ADMIN));

    const element = (await LegalAiPage({ searchParams: searchParams() })) as { type: unknown };

    expect(element.type).toBe(LegalAiChat);
    expect(loadLawyerAiWorkbench).not.toHaveBeenCalled();
  });
});
