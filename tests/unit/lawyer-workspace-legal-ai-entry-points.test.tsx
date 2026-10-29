// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * The two entry points a lawyer actually clicks to reach Legal AI from
 * /lawyer/workspace: the "TORE Legal Chat" launcher card on the dashboard,
 * and the "Legal AI" item in the lawyer sidebar nav (built by
 * getShellI18n("lawyer")). Both must point at the one canonical /legal-ai
 * route — the same route the role-routing test (legal-ai-page-role-routing
 * .test.ts) proves serves LawyerAiWorkbench to an authenticated LAWYER.
 */

vi.mock("@/i18n/get-locale", () => ({ getLocale: async () => "mn" as const }));
vi.mock("@/lib/feature-flags", () => ({ isFoundationOrgsV1Enabled: () => false }));
vi.mock("@/i18n/get-dictionary", () => ({
  getDictionary: async () => ({
    common: { language: "Хэл", brand: "TORE" },
    marketplace: { common: { mainNav: "Үндсэн цэс", navigate: "Чиглүүлэх" } },
    dashboard: {
      navDashboard: "Хяналтын самбар",
      navWorkspace: "Ажлын орчин",
      navCases: "Хэргүүд",
      navMatters: "Хэрэг",
      navOfferings: "Үйлчилгээ",
      navBookings: "Захиалга",
      navBilling: "Тооцоо",
      navNotifications: "Мэдэгдэл",
      navLegalChat: "Legal AI",
      lawyerTitle: "Хуульч",
      profileTitle: "Профайл",
      pageOfferings: "p",
      pageAvailability: "p",
      pageBookings: "p",
      pageNotifications: "p",
      pageVerification: "p",
      signOut: "Гарах",
      feedbackLabel: "Санал хүсэлт",
    },
  }),
}));

import { getShellI18n } from "@/i18n/dashboard-shell-i18n";
import { LawyerWorkspaceAiComposer } from "@/components/case-review/lawyer-workspace-ai-composer";

describe("Lawyer Workspace Legal AI entry points", () => {
  it("the lawyer sidebar nav's Legal AI item points at /legal-ai (the role-routed canonical destination)", async () => {
    const shell = await getShellI18n("lawyer");
    const legalAiItem = shell.nav?.find((item) => item.label === "Legal AI");
    expect(legalAiItem?.href).toBe("/legal-ai");
  });

  it('the "TORE Legal Chat" dashboard panel is a launcher, not an embedded composer: it links to /legal-ai and renders no text input of its own', () => {
    render(<LawyerWorkspaceAiComposer />);

    expect(screen.getByText("TORE Legal Chat")).toBeTruthy();
    const link = screen.getByRole("link", { name: /AI чат нээх/ });
    expect(link.getAttribute("href")).toBe("/legal-ai");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
