// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { LawyerWorkspaceCaseTable } from "@/components/case-review/lawyer-workspace-case-table";
import type { LawyerWorkspaceCaseCard } from "@/application/use-cases/case-review";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function makeCase(
  overrides: Partial<LawyerWorkspaceCaseCard> & { caseId: string },
): LawyerWorkspaceCaseCard {
  return {
    title: "Test case",
    domain: "CIVIL",
    domainLabel: "Иргэний",
    analysisStatus: "NOT_ANALYZED",
    status: "NOT_ANALYZED",
    statusLabel: "Шинжлээгүй",
    conversationCount: 0,
    documentCount: 0,
    lastActivityAt: new Date().toISOString(),
    lastActivityLabel: "Хэрэг үүсгэсэн",
    ...overrides,
  };
}

/**
 * The case table is a "use client" component rendered inside a Server
 * Component tree — it must never call Date.now() itself for relative-time
 * text (that reintroduces the TodayChip-class hydration mismatch). It must
 * be a pure function of the `now` prop, so a fixed (lastActivityAt, now)
 * pair always produces the same text, however long the real wall clock has
 * moved since — including well after the SSR pass computed `now`.
 */
describe("LawyerWorkspaceCaseTable — deterministic relative time", () => {
  it("renders relative time purely from props, not from the ambient clock", () => {
    const referenceNow = new Date("2026-01-15T12:00:00.000Z").getTime();
    const lastActivityAt = new Date(
      referenceNow - 125 * 60_000,
    ).toISOString(); // 2h05m before `now`

    render(
      <LawyerWorkspaceCaseTable
        cases={[makeCase({ caseId: "case-1", lastActivityAt })]}
        now={referenceNow}
      />,
    );

    expect(screen.getByText("2 цагийн өмнө")).toBeTruthy();
  });

  it("produces different, still-deterministic text for a different `now` with the same lastActivityAt", () => {
    const lastActivityAt = "2026-01-15T10:00:00.000Z";

    const { unmount } = render(
      <LawyerWorkspaceCaseTable
        cases={[makeCase({ caseId: "case-1", lastActivityAt })]}
        now={new Date("2026-01-15T10:30:00.000Z").getTime()} // +30 min
      />,
    );
    expect(screen.getByText("30 минутын өмнө")).toBeTruthy();
    unmount();

    render(
      <LawyerWorkspaceCaseTable
        cases={[makeCase({ caseId: "case-1", lastActivityAt })]}
        now={new Date("2026-01-16T10:00:00.000Z").getTime()} // +1 day
      />,
    );
    expect(screen.getByText("өчигдөр")).toBeTruthy();
  });
});

/**
 * The canonical "has this case been analyzed" signal is CaseFile's own
 * analysisStatus field. A genuinely analyzed case's display `status` is
 * the engine's disposition (e.g. "SUPPORTED"), not the literal "ANALYZED"
 * — the filter/counts must never key off `status` for this.
 */
describe("LawyerWorkspaceCaseTable — Шинжилсэн filter uses analysisStatus", () => {
  const analyzedCase = makeCase({
    caseId: "analyzed-1",
    title: "Analyzed case",
    analysisStatus: "ANALYZED",
    status: "SUPPORTED", // real engine disposition, never the literal "ANALYZED"
    statusLabel: "Дэмжигдсэн",
  });
  const unanalyzedCase = makeCase({
    caseId: "not-analyzed-1",
    title: "Unanalyzed case",
    analysisStatus: "NOT_ANALYZED",
    status: "NOT_ANALYZED",
    statusLabel: "Шинжлээгүй",
  });

  it("A: a genuinely analyzed case (disposition status, ANALYZED analysisStatus) is counted and shown under Шинжилсэн", () => {
    render(
      <LawyerWorkspaceCaseTable
        cases={[analyzedCase, unanalyzedCase]}
        now={Date.now()}
      />,
    );

    fireEvent.click(screen.getByText(/^Шинжилсэн/));

    expect(screen.getByText("Analyzed case")).toBeTruthy();
  });

  it("B: an unanalyzed case does not appear under Шинжилсэн", () => {
    render(
      <LawyerWorkspaceCaseTable
        cases={[analyzedCase, unanalyzedCase]}
        now={Date.now()}
      />,
    );

    fireEvent.click(screen.getByText(/^Шинжилсэн/));

    expect(screen.queryByText("Unanalyzed case")).toBeNull();
  });

  it("C: the Шинжилсэн/Шинжлээгүй tab counts match the underlying analysisStatus data", () => {
    render(
      <LawyerWorkspaceCaseTable
        cases={[analyzedCase, unanalyzedCase]}
        now={Date.now()}
      />,
    );

    expect(screen.getByText("Шинжилсэн (1)")).toBeTruthy();
    expect(screen.getByText("Шинжлээгүй (1)")).toBeTruthy();
    expect(screen.getByText("Бүгд (2)")).toBeTruthy();
  });
});
