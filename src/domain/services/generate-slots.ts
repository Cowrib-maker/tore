import type { InstantSlot } from "@/domain/value-objects/time-slot";
import type { AvailabilityException, AvailabilityRule } from "@/domain/entities/availability";
import type { Booking } from "@/domain/entities/booking";
import { isSlotAvailable } from "@/domain/services/slot-availability";

/**
 * Generate candidate slots from weekly rules for a date range.
 * Times on rules are treated as wall-clock HH:mm in the lawyer's local timezone context
 * approximated via UTC construction for MVP (timezone field used for display).
 */
export function generateCandidateSlots(params: {
  rules: AvailabilityRule[];
  fromDate: Date;
  days: number;
  durationMinutes: number;
  stepMinutes?: number;
}): InstantSlot[] {
  const step = params.stepMinutes ?? params.durationMinutes;
  const slots: InstantSlot[] = [];
  const startDay = new Date(
    Date.UTC(
      params.fromDate.getUTCFullYear(),
      params.fromDate.getUTCMonth(),
      params.fromDate.getUTCDate(),
    ),
  );

  for (let d = 0; d < params.days; d++) {
    const day = new Date(startDay.getTime() + d * 24 * 60 * 60 * 1000);
    const jsDay = day.getUTCDay();
    const dayMap = [
      "SUNDAY",
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
    ] as const;
    const dayName = dayMap[jsDay];
    const dayRules = params.rules.filter(
      (r) => r.isActive && r.dayOfWeek === dayName,
    );

    for (const rule of dayRules) {
      const [sh, sm] = rule.startTime.split(":").map(Number);
      const [eh, em] = rule.endTime.split(":").map(Number);
      let cursor = Date.UTC(
        day.getUTCFullYear(),
        day.getUTCMonth(),
        day.getUTCDate(),
        sh ?? 0,
        sm ?? 0,
        0,
        0,
      );
      const endMs = Date.UTC(
        day.getUTCFullYear(),
        day.getUTCMonth(),
        day.getUTCDate(),
        eh ?? 0,
        em ?? 0,
        0,
        0,
      );

      while (cursor + params.durationMinutes * 60_000 <= endMs) {
        slots.push({
          startAt: new Date(cursor),
          endAt: new Date(cursor + params.durationMinutes * 60_000),
        });
        cursor += step * 60_000;
      }
    }
  }

  return slots;
}

export function filterAvailableSlots(params: {
  candidates: InstantSlot[];
  rules: AvailabilityRule[];
  exceptions: AvailabilityException[];
  bookings: Booking[];
  now?: Date;
}): InstantSlot[] {
  const now = params.now ?? new Date();
  return params.candidates.filter(
    (slot) =>
      slot.startAt.getTime() > now.getTime() &&
      isSlotAvailable(
        slot,
        params.rules,
        params.exceptions,
        params.bookings,
      ),
  );
}
