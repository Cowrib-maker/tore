import { describe, expect, it } from "vitest";

import type { AvailabilityRule } from "@/domain/entities/availability";
import { BookingStatus, DayOfWeek } from "@/domain/enums";
import {
  filterAvailableSlots,
  generateCandidateSlots,
} from "@/domain/services/generate-slots";

function rule(
  dayOfWeek: DayOfWeek,
  startTime: string,
  endTime: string,
): AvailabilityRule {
  return {
    id: `${dayOfWeek}-${startTime}`,
    lawyerProfileId: "lp1",
    dayOfWeek,
    startTime,
    endTime,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("generate-slots", () => {
  it("builds candidates from weekly rules", () => {
    // 2026-08-10 is a Monday in UTC
    const fromDate = new Date(Date.UTC(2026, 7, 10));
    const slots = generateCandidateSlots({
      rules: [rule(DayOfWeek.MONDAY, "09:00", "11:00")],
      fromDate,
      days: 1,
      durationMinutes: 60,
    });
    expect(slots).toHaveLength(2);
    expect(slots[0]?.startAt.toISOString()).toBe("2026-08-10T09:00:00.000Z");
    expect(slots[1]?.startAt.toISOString()).toBe("2026-08-10T10:00:00.000Z");
  });

  it("filters past and overlapping booked slots", () => {
    const fromDate = new Date(Date.UTC(2026, 7, 10));
    const rules = [rule(DayOfWeek.MONDAY, "09:00", "13:00")];
    const candidates = generateCandidateSlots({
      rules,
      fromDate,
      days: 1,
      durationMinutes: 60,
    });
    const bookings = [
      {
        id: "b1",
        bookingNumber: "TORE-1",
        clientUserId: "c1",
        lawyerProfileId: "lp1",
        offeringId: "o1",
        practiceAreaId: null,
        status: BookingStatus.PENDING_ACCEPTANCE,
        issueSummary: "test issue summary long enough",
        scheduledStartAt: new Date("2026-08-10T10:00:00.000Z"),
        scheduledEndAt: new Date("2026-08-10T11:00:00.000Z"),
        acceptedAt: null,
        declinedAt: null,
        declineReason: null,
        completedAt: null,
        cancelledAt: null,
        cancellationReason: null,
        cancelledByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const available = filterAvailableSlots({
      candidates,
      rules,
      exceptions: [],
      bookings,
      now: new Date("2026-08-09T00:00:00.000Z"),
    });

    expect(available.map((s) => s.startAt.toISOString())).toEqual([
      "2026-08-10T09:00:00.000Z",
      "2026-08-10T11:00:00.000Z",
    ]);
  });
});
