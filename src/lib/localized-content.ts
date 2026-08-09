import type { Locale } from "@/i18n/config";

/** Prefer English labels only for `en`; all other locales use Mongolian fields. */
export function localizedTaxonomyName(
  entity: { nameMn: string; nameEn: string },
  locale: Locale,
): string {
  if (locale === "en") {
    return entity.nameEn || entity.nameMn;
  }
  return entity.nameMn || entity.nameEn;
}

export function localizedOfferingTitle(
  entity: { titleMn: string; titleEn: string | null },
  locale: Locale,
): string {
  if (locale === "en") {
    return entity.titleEn || entity.titleMn;
  }
  return entity.titleMn || entity.titleEn || "";
}
