import type { MarketplaceDictionary } from "@/i18n/marketplace-types";
import type { Locale } from "@/i18n/config";
import { defaultLocale } from "@/i18n/config";
import { getDictionarySync } from "@/i18n/get-dictionary-sync";

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
 * "YYYY.MM.DD Weekday" label for a given date. Built from plain date-part
 * getters and the app's own weekday dictionary — never Intl — so a caller
 * can compute this once (e.g. server-side) and hand the resulting string to
 * a client component to render verbatim, with no risk of the weekday
 * differing between the Node SSR runtime's ICU and the browser's.
 */
export function formatTodayLabelMn(date: Date, locale?: Locale): string {
  const weekday = formatWeekday(WEEKDAY_KEYS_BY_INDEX[date.getDay()]!, locale);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day} ${weekday}`;
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

export type { StatusLabels, Weekdays };
