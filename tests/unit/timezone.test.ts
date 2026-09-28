import { describe, expect, it } from "vitest";

import { calendarDayWindowInTimeZone } from "@/domain/services/timezone";

describe("calendarDayWindowInTimeZone", () => {
  it("classifies a booking near UTC midnight per the lawyer's configured timezone, not the server's", () => {
    // 2026-01-15T16:30:00Z is 2026-01-16 00:30 in Asia/Ulaanbaatar (UTC+8) —
    // "tomorrow" in plain UTC terms, but genuinely "today" for the lawyer.
    const instant = new Date("2026-01-15T16:30:00.000Z");
    const { start, end } = calendarDayWindowInTimeZone(
      instant,
      "Asia/Ulaanbaatar",
    );

    expect(instant.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(instant.getTime()).toBeLessThan(end.getTime());
    // The window should be the UA calendar day Jan 16, not UTC's Jan 15.
    expect(start.toISOString()).toBe("2026-01-15T16:00:00.000Z"); // 2026-01-16 00:00 UA
    expect(end.toISOString()).toBe("2026-01-16T16:00:00.000Z"); // 2026-01-17 00:00 UA
  });

  it("the same instant falls in a different calendar day under UTC than under Asia/Ulaanbaatar", () => {
    const instant = new Date("2026-01-15T16:30:00.000Z");
    const utcWindow = calendarDayWindowInTimeZone(instant, "UTC");
    const uaWindow = calendarDayWindowInTimeZone(instant, "Asia/Ulaanbaatar");

    expect(utcWindow.start.toISOString()).not.toBe(
      uaWindow.start.toISOString(),
    );
  });

  it("handles a DST spring-forward boundary correctly (America/New_York, 2026-03-08)", () => {
    // US DST begins 2026-03-08 02:00 -> 03:00 local; that calendar day is
    // 23 real hours long. The window must still be a real [start, end)
    // pair with the instant inside it.
    const instant = new Date("2026-03-08T18:00:00.000Z"); // 13:00 EST/EDT-ish
    const { start, end } = calendarDayWindowInTimeZone(
      instant,
      "America/New_York",
    );
    expect(start.getTime()).toBeLessThan(instant.getTime());
    expect(end.getTime()).toBeGreaterThan(instant.getTime());
    expect(end.getTime() - start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("handles a DST fall-back boundary correctly (America/New_York, 2026-11-01, 25h day)", () => {
    const instant = new Date("2026-11-01T18:00:00.000Z");
    const { start, end } = calendarDayWindowInTimeZone(
      instant,
      "America/New_York",
    );
    expect(end.getTime() - start.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it("falls back to UTC for an invalid timezone string instead of throwing", () => {
    const instant = new Date("2026-01-15T12:00:00.000Z");
    expect(() =>
      calendarDayWindowInTimeZone(instant, "Not/AZone"),
    ).not.toThrow();
    const { start } = calendarDayWindowInTimeZone(instant, "Not/AZone");
    const utcStart = calendarDayWindowInTimeZone(instant, "UTC").start;
    expect(start.toISOString()).toBe(utcStart.toISOString());
  });
});
