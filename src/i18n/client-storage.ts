import {
  defaultLocale,
  isLocale,
  locales,
  type Locale,
} from "@/i18n/config";

export const LOCALE_STORAGE_KEY = "tore_locale";

/** Menu order matching product copy: English, 中文, 한국어, Монгол */
export const localeMenuOrder: readonly Locale[] = ["en", "zh", "ko", "mn"];

export function readStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // private mode / quota — cookie remains source of truth for SSR
  }
}

export function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return defaultLocale;
  const candidates = [
    ...(navigator.languages ?? []),
    navigator.language,
  ].filter(Boolean);

  for (const tag of candidates) {
    const base = tag.toLowerCase().split("-")[0] ?? "";
    if (base === "zh") return "zh";
    if (isLocale(base)) return base;
  }
  return defaultLocale;
}

export { locales };
