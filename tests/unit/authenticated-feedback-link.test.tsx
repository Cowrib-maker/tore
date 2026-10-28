// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/lawyer/workspace",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { LawyerWorkspaceFrame } from "@/components/case-review/lawyer-workspace-frame";
import { locales } from "@/i18n/config";
import { getDictionarySync } from "@/i18n/get-dictionary-sync";

/**
 * Priority 2 (pilot blocker closure): authenticated lawyer/client/admin
 * surfaces previously had no in-app way to reach the feedback form — only
 * the public landing page's #feedback anchor did (see
 * docs/release/TORE-KNOWN-LIMITATIONS.md §2-3). This covers the fix: every
 * authenticated chrome component renders a link to the public feedback
 * anchor when given feedbackHref, and renders nothing extra when it is
 * omitted (so existing snapshots/behavior for callers that don't pass it
 * are unaffected).
 */

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    })) as never;
  }
});

afterEach(() => cleanup());

const user = { name: "Test User", email: "test@tore.test" };
const baseShellProps = {
  locale: "mn" as const,
  languageLabel: "Хэл",
  signOutLabel: "Гарах",
};

describe("authenticated feedback link — dictionary completeness", () => {
  it("every locale defines a non-empty dashboard.feedbackLabel", () => {
    for (const locale of locales) {
      const dict = getDictionarySync(locale);
      expect(dict.dashboard.feedbackLabel.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("authenticated feedback link — DashboardShell (client)", () => {
  it("renders a feedback link when feedbackHref is set", () => {
    const { getByRole } = render(
      <DashboardShell user={user} feedbackHref="/#feedback" feedbackLabel="Санал хүсэлт илгээх" {...baseShellProps}>
        <p>content</p>
      </DashboardShell>,
    );
    const link = getByRole("link", { name: "Санал хүсэлт илгээх" });
    expect(link.getAttribute("href")).toBe("/#feedback");
  });

  it("renders nothing when feedbackHref is omitted", () => {
    const { queryByRole } = render(
      <DashboardShell user={user} {...baseShellProps}>
        <p>content</p>
      </DashboardShell>,
    );
    expect(queryByRole("link", { name: "Send feedback" })).toBeNull();
  });
});

describe("authenticated feedback link — WorkspaceShell (admin + lawyer non-workspace pages)", () => {
  it("renders a feedback link when feedbackHref is set", () => {
    const { getByRole } = render(
      <WorkspaceShell
        context="admin"
        user={user}
        navGroups={[{ items: [] }]}
        feedbackHref="/#feedback"
        feedbackLabel="Санал хүсэлт илгээх"
        {...baseShellProps}
      >
        <p>content</p>
      </WorkspaceShell>,
    );
    const link = getByRole("link", { name: "Санал хүсэлт илгээх" });
    expect(link.getAttribute("href")).toBe("/#feedback");
  });

  it("renders nothing when feedbackHref is omitted", () => {
    const { queryByRole } = render(
      <WorkspaceShell context="lawyer" user={user} navGroups={[{ items: [] }]} {...baseShellProps}>
        <p>content</p>
      </WorkspaceShell>,
    );
    expect(queryByRole("link", { name: "Send feedback" })).toBeNull();
  });
});

describe("authenticated feedback link — LawyerWorkspaceFrame (/lawyer/workspace)", () => {
  const frameProps = {
    user,
    profileHref: "/lawyer/profile",
    locale: "mn" as const,
    languageLabel: "Хэл",
    signOutLabel: "Гарах",
  };

  it("page variant: renders a feedback link in the desktop header when feedbackHref is set", () => {
    const { getByRole } = render(
      <LawyerWorkspaceFrame {...frameProps} feedbackHref="/#feedback" feedbackLabel="Санал хүсэлт илгээх">
        <p>content</p>
      </LawyerWorkspaceFrame>,
    );
    const links = getByRole("link", { name: "Санал хүсэлт илгээх" });
    expect(links).toBeTruthy();
  });

  it("page variant: renders no feedback link when feedbackHref is omitted", () => {
    const { queryAllByRole } = render(
      <LawyerWorkspaceFrame {...frameProps}>
        <p>content</p>
      </LawyerWorkspaceFrame>,
    );
    expect(queryAllByRole("link", { name: "Санал хүсэлт илгээх" })).toHaveLength(0);
  });

  it("workbench variant: renders a feedback link in the sidebar when feedbackHref is set", () => {
    const { getAllByRole } = render(
      <LawyerWorkspaceFrame
        {...frameProps}
        variant="workbench"
        feedbackHref="/#feedback"
        feedbackLabel="Санал хүсэлт илгээх"
      >
        <p>content</p>
      </LawyerWorkspaceFrame>,
    );
    const links = getAllByRole("link", { name: "Санал хүсэлт илгээх" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe("/#feedback");
    }
  });
});
