import type {
  AvailabilityException,
  AvailabilityRule,
} from "@/domain/entities/availability";
import type { DayOfWeek } from "@/domain/enums";
import type { TimeOnly } from "@/domain/value-objects/time-slot";

function timeFromDate(value: Date): TimeOnly {
  return value.toISOString().slice(11, 16);
}

function dateOnlyFromDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function mapAvailabilityRule(record: {
  id: string;
  lawyerProfileId: string;
  dayOfWeek: string;
  startTime: Date;
  endTime: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AvailabilityRule {
  return {
    id: record.id,
    lawyerProfileId: record.lawyerProfileId,
    dayOfWeek: record.dayOfWeek as DayOfWeek,
    startTime: timeFromDate(record.startTime),
    endTime: timeFromDate(record.endTime),
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function mapAvailabilityException(record: {
  id: string;
  lawyerProfileId: string;
  exceptionDate: Date;
  startTime: Date | null;
  endTime: Date | null;
  isAvailable: boolean;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AvailabilityException {
  return {
    id: record.id,
    lawyerProfileId: record.lawyerProfileId,
    exceptionDate: dateOnlyFromDate(record.exceptionDate),
    startTime: record.startTime ? timeFromDate(record.startTime) : null,
    endTime: record.endTime ? timeFromDate(record.endTime) : null,
    isAvailable: record.isAvailable,
    reason: record.reason,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** Build a Date for Prisma @db.Time using a fixed UTC calendar day. */
export function timeOnlyToDate(time: TimeOnly): Date {
  const [h, m] = time.split(":").map(Number);
  return new Date(Date.UTC(1970, 0, 1, h ?? 0, m ?? 0, 0, 0));
}

export function dateOnlyToDate(date: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (mo ?? 1) - 1, d ?? 1));
}
