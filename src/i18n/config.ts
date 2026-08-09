export const locales = ["mn", "en", "zh", "ko"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "mn";

export const LOCALE_COOKIE = "tore_locale";

export const localeMeta: Record<
  Locale,
  {
    label: string;
    nativeLabel: string;
    shortLabel: string;
    code: string;
    htmlLang: string;
  }
> = {
  mn: {
    label: "Mongolian",
    nativeLabel: "Монгол",
    shortLabel: "MN",
    code: "MN",
    htmlLang: "mn",
  },
  en: {
    label: "English",
    nativeLabel: "English",
    shortLabel: "EN",
    code: "EN",
    htmlLang: "en",
  },
  zh: {
    label: "Chinese",
    nativeLabel: "中文",
    shortLabel: "中文",
    code: "ZH",
    htmlLang: "zh-CN",
  },
  ko: {
    label: "Korean",
    nativeLabel: "한국어",
    shortLabel: "한",
    code: "KO",
    htmlLang: "ko",
  },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.includes(value as Locale);
}
