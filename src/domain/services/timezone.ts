/**
 * Real IANA timezone day-boundary math via Intl.DateTimeFormat — no fixed
 * UTC-offset approximation, no external dependency, correct across DST
 * transitions because the offset is read for the actual instant in
 * question rather than assumed constant.
 */

const FALLBACK_TIME_ZONE = "UTC";

/**
 * The (year, month, day) a caller in `timeZone` would read off a calendar
 * for `instant`. Exported so other date-label formatting (e.g. the
 * workspace's "today" chip) can derive the lawyer's calendar day without
 * re-implementing this Intl parsing.
 */
export function wallDateParts(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

/** UTC-instant minus what `instant` reads as in `timeZone`, treated as UTC —
 * i.e. the timezone's actual offset (ms) at that instant. */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

/** The UTC instant corresponding to 00:00:00 wall-clock time on
 * (year, month, day) in `timeZone`. `day` may overflow (e.g. day 32) —
 * Date.UTC normalizes it, which is how "tomorrow" is derived below. */
function utcInstantForWallDate(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date {
  let guess = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  // Two passes converge even when local midnight itself falls inside a DST
  // transition (rare, but this keeps the result exact rather than off by
  // the transition's delta).
  for (let i = 0; i < 2; i++) {
    const offsetMs = timeZoneOffsetMs(new Date(guess), timeZone);
    guess = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - offsetMs;
  }
  return new Date(guess);
}

/** Falls back to UTC only if `timeZone` is not a valid IANA zone identifier. */
export function safeTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

/**
 * The [start, end) UTC instant window for the calendar day containing
 * `instant`, as observed in `timeZone` — e.g. a lawyer's LawyerProfile
 * timezone. Falls back to UTC only if `timeZone` is not a valid IANA zone
 * identifier (never to a specific region).
 */
export function calendarDayWindowInTimeZone(
  instant: Date,
  timeZone: string,
): { start: Date; end: Date } {
  const zone = safeTimeZone(timeZone);
  const { year, month, day } = wallDateParts(instant, zone);
  return {
    start: utcInstantForWallDate(year, month, day, zone),
    end: utcInstantForWallDate(year, month, day + 1, zone),
  };
}
