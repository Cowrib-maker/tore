import {
  defaultLocale,
  isLocale,
  locales,
  type Locale,
} from "@/i18n/config";

/**
 * TORE targets the Mongolian market first, so an absent locale cookie
 * always resolves to Mongolian rather than following the browser's
 * Accept-Language header (English is a near-universal secondary/system
 * language, which made most first-time visitors see English by default).
 * Visitors can still switch language explicitly via the nav switcher,
 * which sets the locale cookie and is respected by resolveLocale above.
 */
export function negotiateLocale(_acceptLanguage: string | null): Locale {
  return defaultLocale;
}

export function resolveLocale(cookieValue: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  return negotiateLocale(acceptLanguage);
}

export { locales, defaultLocale };
