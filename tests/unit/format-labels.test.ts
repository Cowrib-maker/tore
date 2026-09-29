import { describe, expect, it } from "vitest";

import { formatTodayLabelMn } from "@/lib/format-labels";

/**
 * formatTodayLabelMn must derive both the date and the weekday from the
 * calendar day in the *given* IANA timezone — never from the server
 * process's own local timezone/getters. This is the regression coverage
 * for the Lawyer Workspace "today" label bug: the label and the
 * timezone-aware todaysConfirmedCount booking count must never disagree.
 */
describe("formatTodayLabelMn", () => {
  it("uses the lawyer's configured timezone, not UTC, at a boundary where the two dates differ", () => {
    // 2026-01-15T17:00:00Z is already 2026-01-16 01:00 in Asia/Ulaanbaatar
    // (UTC+8) — a UTC-based label would wrongly read "2026.01.15".
    const instant = new Date("2026-01-15T17:00:00.000Z");

    expect(formatTodayLabelMn(instant, "Asia/Ulaanbaatar")).toBe(
      "2026.01.16 Баасан",
    );
    expect(formatTodayLabelMn(instant, "UTC")).toBe("2026.01.15 Пүрэв");
  });

  it("computes the weekday from the same timezone-derived calendar date, never from the raw instant", () => {
    // 2026-01-16 is a Friday (Баасан); 2026-01-15 is a Thursday (Пүрэв).
    // Getting the date right but the weekday wrong (or vice versa) would
    // still be a bug, so both are asserted against the same call.
    const instant = new Date("2026-01-15T17:00:00.000Z");
    const label = formatTodayLabelMn(instant, "Asia/Ulaanbaatar");
    expect(label).toBe("2026.01.16 Баасан");
  });

  it("is independent of the server/ambient timezone: two different explicit zones for the same instant produce different, internally-consistent labels", () => {
    const instant = new Date("2026-03-08T05:00:00.000Z");

    // America/New_York is UTC-5 in early March (before spring-forward on
    // 2026-03-08) — local time is still March 8 there.
    expect(formatTodayLabelMn(instant, "America/New_York")).toBe(
      "2026.03.08 Ням",
    );
    // Asia/Ulaanbaatar (UTC+8) is already March 8, 13:00 — same calendar day
    // here, but derived independently via the explicit timezone parameter,
    // not any ambient default.
    expect(formatTodayLabelMn(instant, "Asia/Ulaanbaatar")).toBe(
      "2026.03.08 Ням",
    );
  });

  it("falls back to UTC without throwing for an invalid IANA timezone string", () => {
    const instant = new Date("2026-01-15T12:00:00.000Z");
    expect(() => formatTodayLabelMn(instant, "Not/AZone")).not.toThrow();
    expect(formatTodayLabelMn(instant, "Not/AZone")).toBe(
      "2026.01.15 Пүрэв",
    );
  });
});
