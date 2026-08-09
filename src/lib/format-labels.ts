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

export function formatNotificationType(
  type: string,
  locale?: Locale,
): string {
  const map = labels(locale).status.notificationType as Record<string, string>;
  return map[type] ?? humanize(type);
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
