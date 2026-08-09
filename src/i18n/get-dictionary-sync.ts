import type { Locale } from "@/i18n/config";
import { defaultLocale } from "@/i18n/config";
import { en } from "@/i18n/dictionaries/en";
import { ko } from "@/i18n/dictionaries/ko";
import { mn } from "@/i18n/dictionaries/mn";
import { zh } from "@/i18n/dictionaries/zh";
import type { Dictionary } from "@/i18n/types";

/**
 * Client-safe dictionary lookup.
 * Must NOT import next/headers or any Server-only module.
 */
const dictionaries: Record<Locale, Dictionary> = {
  mn,
  en,
  zh,
  ko,
};

export function getDictionarySync(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[defaultLocale];
}
