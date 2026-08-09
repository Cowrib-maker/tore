import type { DayOfWeek } from "@/domain/enums";

/** Calendar date without time (YYYY-MM-DD). */
export type DateOnly = string;

/** Local time without timezone (HH:mm). */
export type TimeOnly = string;

export interface WeeklyTimeSlot {
  dayOfWeek: DayOfWeek;
  startTime: TimeOnly;
  endTime: TimeOnly;
}

export interface DatedTimeSlot {
  date: DateOnly;
  startTime: TimeOnly;
  endTime: TimeOnly;
}

export interface InstantSlot {
  startAt: Date;
  endAt: Date;
}

export function isSlotOrdered(slot: InstantSlot): boolean {
  return slot.startAt.getTime() < slot.endAt.getTime();
}

export function slotsOverlap(a: InstantSlot, b: InstantSlot): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}
