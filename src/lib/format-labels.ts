import type { MarketplaceDictionary } from "@/i18n/marketplace-types";
import type { Locale } from "@/i18n/config";
import { defaultLocale } from "@/i18n/config";
import { getDictionarySync } from "@/i18n/get-dictionary-sync";
import { safeTimeZone, wallDateParts } from "@/domain/services/timezone";

type StatusLabels = MarketplaceDictionary["status"];
type Weekdays = MarketplaceDictionary["weekdays"];

/**
 * Shared label formatters — safe for Client and Server Components.
 * Relies only on get-dictionary-sync (no next/headers).
 */
function labels(locale?: Locale): MarketplaceDictionary {
  return getDictionarySync(locale ?? defaultLocale).marketplace;
}

function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function formatBookingStatus(
  status: string,
  locale?: Locale,
): string {
  const map = labels(locale).status.booking as Record<string, string>;
  return map[status] ?? humanize(status);
}

export function formatVerificationStatus(
  status: string,
  locale?: Locale,
): string {
  const map = labels(locale).status.verification as Record<string, string>;
  return map[status] ?? humanize(status);
}

export function formatCredentialStatus(
  status: string,
  locale?: Locale,
): string {
  const map = labels(locale).status.credential as Record<string, string>;
  return map[status] ?? humanize(status);
}

export function formatModality(modality: string, locale?: Locale): string {
  const c = labels(locale).common;
  if (modality === "ONLINE") return c.online;
  if (modality === "IN_PERSON") return c.inPerson;
  return humanize(modality);
}

export function formatWeekday(day: string, locale?: Locale): string {
  const map = labels(locale).weekdays as Record<string, string>;
  return map[day] ?? humanize(day);
}

/** Date.getDay() order (0 = Sunday) — indexes into the weekdays dictionary. */
const WEEKDAY_KEYS_BY_INDEX: (keyof Weekdays)[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

/**
 * "YYYY.MM.DD Weekday" label for the calendar day `instant` falls on in
 * `timeZone` — e.g. a lawyer's LawyerProfile.timezone, never the server
 * process's own local timezone. The (year, month, day) come from
 * `wallDateParts` (the same Intl-based day math `calendarDayWindowInTimeZone`
 * uses), and the weekday is derived from that pure calendar date — not from
 * `instant` directly — so the label and weekday can never disagree.
 * Callers compute this once (e.g. server-side) and hand the resulting string
 * to a client component to render verbatim, with no risk of it differing
 * between the Node SSR runtime's ICU and the browser's, and no risk of it
 * drifting from the same PR's timezone-aware booking counts.
 */
export function formatTodayLabelMn(
  instant: Date,
  timeZone: string,
  locale?: Locale,
): string {
  const { year, month, day } = wallDateParts(instant, safeTimeZone(timeZone));
  const weekdayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const weekday = formatWeekday(WEEKDAY_KEYS_BY_INDEX[weekdayIndex]!, locale);
  return `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")} ${weekday}`;
}

export function formatNotificationType(
  type: string,
  locale?: Locale,
): string {
  const map = labels(locale).status.notificationType as Record<string, string>;
  return map[type] ?? humanize(type);
}

export function formatAuditAction(action: string, locale?: Locale): string {
  const map = labels(locale).status.auditAction as Record<string, string>;
  return map[action] ?? humanize(action);
}

export function formatDateTimeUtc(date: Date, locale?: Locale): string {
  const tag =
    locale === "mn"
      ? "mn-MN"
      : locale === "zh"
        ? "zh-CN"
        : locale === "ko"
          ? "ko-KR"
          : "en-GB";
  return new Intl.DateTimeFormat(tag, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

/**
 * User-visible instants are shown in Asia/Ulaanbaatar (UTC+8, no DST since
 * 2017). Stored instants stay UTC; only the display changes.
 */
export const DISPLAY_TIME_ZONE = "Asia/Ulaanbaatar";

export function formatDateTimeUlaanbaatar(date: Date, locale?: Locale): string {
  const tag =
    locale === "mn"
      ? "mn-MN"
      : locale === "zh"
        ? "zh-CN"
        : locale === "ko"
          ? "ko-KR"
          : "en-GB";
  return new Intl.DateTimeFormat(tag, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: DISPLAY_TIME_ZONE,
  }).format(date);
}

export type { StatusLabels, Weekdays };
