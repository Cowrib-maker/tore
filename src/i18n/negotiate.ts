import { match } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";

import {
  defaultLocale,
  isLocale,
  locales,
  type Locale,
} from "@/i18n/config";

/** Map BCP-47 tags to our short locale codes for intl-localematcher. */
const negotiatorLocales = ["mn", "en", "zh-CN", "zh", "ko"] as const;

function toAppLocale(matched: string): Locale {
  const base = matched.toLowerCase().split("-")[0] ?? matched;
  if (base === "zh") return "zh";
  if (isLocale(base)) return base;
  return defaultLocale;
}

export function negotiateLocale(acceptLanguage: string | null): Locale {
  try {
    const headers = { "accept-language": acceptLanguage ?? defaultLocale };
    const languages = new Negotiator({ headers }).languages();
    const matched = match([...languages], [...negotiatorLocales], defaultLocale);
    return toAppLocale(matched);
  } catch {
    return defaultLocale;
  }
}

export function resolveLocale(cookieValue: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  return negotiateLocale(acceptLanguage);
}

export { locales, defaultLocale };
