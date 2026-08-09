import type { AvailabilityException, AvailabilityRule } from "@/domain/entities/availability";
import type { Booking } from "@/domain/entities/booking";
import { BookingStatus, DayOfWeek } from "@/domain/enums";
import {
  isSlotOrdered,
  slotsOverlap,
  type InstantSlot,
} from "@/domain/value-objects/time-slot";

const BLOCKING_BOOKING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.PENDING_PAYMENT,
  BookingStatus.PENDING_ACCEPTANCE,
  BookingStatus.CONFIRMED,
  BookingStatus.IN_PROGRESS,
];

export function isBlockingBookingStatus(status: BookingStatus): boolean {
  return BLOCKING_BOOKING_STATUSES.includes(status);
}

export function hasConflictingBooking(
  existingBookings: Booking[],
  slot: InstantSlot,
  excludeBookingId?: string,
): boolean {
  if (!isSlotOrdered(slot)) {
    return true;
  }

  return existingBookings.some((booking) => {
    if (excludeBookingId && booking.id === excludeBookingId) {
      return false;
    }

    if (!isBlockingBookingStatus(booking.status)) {
      return false;
    }

    return slotsOverlap(slot, {
      startAt: booking.scheduledStartAt,
      endAt: booking.scheduledEndAt,
    });
  });
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatTimeOnly(date: Date): string {
  return date.toISOString().slice(11, 16);
}

function dayOfWeekFromDate(date: Date): DayOfWeek {
  const days: DayOfWeek[] = [
    DayOfWeek.SUNDAY,
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY,
    DayOfWeek.SATURDAY,
  ];
  return days[date.getUTCDay()] ?? DayOfWeek.MONDAY;
}

function timeWithinRange(
  time: string,
  start: string,
  end: string,
): boolean {
  return time >= start && time < end;
}

export function isWithinWeeklyRules(
  slot: InstantSlot,
  rules: AvailabilityRule[],
): boolean {
  const day = dayOfWeekFromDate(slot.startAt);
  const startTime = formatTimeOnly(slot.startAt);
  const endTime = formatTimeOnly(slot.endAt);

  return rules.some(
    (rule) =>
      rule.isActive &&
      rule.dayOfWeek === day &&
      timeWithinRange(startTime, rule.startTime, rule.endTime) &&
      timeWithinRange(endTime, rule.startTime, rule.endTime),
  );
}

export function isBlockedByException(
  slot: InstantSlot,
  exceptions: AvailabilityException[],
): boolean {
  const date = formatDateOnly(slot.startAt);
  const startTime = formatTimeOnly(slot.startAt);
  const endTime = formatTimeOnly(slot.endAt);

  return exceptions.some((exception) => {
    if (exception.exceptionDate !== date) {
      return false;
    }

    if (exception.isAvailable) {
      return false;
    }

    if (!exception.startTime || !exception.endTime) {
      return true;
    }

    return (
      timeWithinRange(startTime, exception.startTime, exception.endTime) ||
      timeWithinRange(endTime, exception.startTime, exception.endTime)
    );
  });
}

export function isSlotAvailable(
  slot: InstantSlot,
  rules: AvailabilityRule[],
  exceptions: AvailabilityException[],
  existingBookings: Booking[],
  excludeBookingId?: string,
): boolean {
  if (!isSlotOrdered(slot)) {
    return false;
  }

  if (!isWithinWeeklyRules(slot, rules)) {
    return false;
  }

  if (isBlockedByException(slot, exceptions)) {
    return false;
  }

  if (hasConflictingBooking(existingBookings, slot, excludeBookingId)) {
    return false;
  }

  return true;
}
