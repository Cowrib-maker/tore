// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { LawyerWorkspaceRightRail } from "@/components/case-review/lawyer-workspace-right-rail";
import type { LawyerWorkspaceSummary } from "@/application/use-cases/case-review";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const summary: LawyerWorkspaceSummary = {
  caseCount: 0,
  analyzedCaseCount: 0,
  notAnalyzedCaseCount: 0,
  conversationCount: 0,
  conversationsLast7Days: 0,
  documentCount: 0,
};

const schedule = {
  pendingBookingCount: 0,
  todaysConfirmedCount: 0,
  upcoming: [],
};

/**
 * The loader now returns real, structured event/case fields instead of a
 * combined "case · event" string, so this must render as two distinct
 * lines (event title, then case-name caption) — never one merged string.
 */
describe("LawyerWorkspaceRightRail — activity title/caption hierarchy", () => {
  it("renders the event text and the case name as separate lines, not one combined string", () => {
    render(
      <LawyerWorkspaceRightRail
        summary={summary}
        schedule={schedule}
        activity={[
          {
            id: "a1",
            at: new Date().toISOString(),
            title: "Баримт нэмэгдлээ",
            caseTitle: "Иргэний хэрэг — Батбаярын нэхэмжлэл",
          },
        ]}
      />,
    );

    expect(screen.getByText("Баримт нэмэгдлээ")).toBeTruthy();
    expect(
      screen.getByText("Иргэний хэрэг — Батбаярын нэхэмжлэл"),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "Иргэний хэрэг — Батбаярын нэхэмжлэл · Баримт нэмэгдлээ",
      ),
    ).toBeNull();
  });

  it("omits the caption line entirely for an unattached (no case) activity item", () => {
    render(
      <LawyerWorkspaceRightRail
        summary={summary}
        schedule={schedule}
        activity={[
          {
            id: "a2",
            at: new Date().toISOString(),
            title: "AI яриа эхлүүлсэн",
            caseTitle: null,
          },
        ]}
      />,
    );

    expect(screen.getByText("AI яриа эхлүүлсэн")).toBeTruthy();
  });
});
