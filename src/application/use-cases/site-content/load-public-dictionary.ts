import { unstable_cache } from "next/cache";

import { SITE_CONTENT_CACHE_TAG, withPublishedSiteContent } from "@/application/use-cases/site-content/published-site-content";
import type { Dictionary } from "@/i18n/types";
import { getDictionary } from "@/i18n/get-dictionary";
import { getLocale } from "@/i18n/get-locale";
import { siteContentRepository } from "@/infrastructure/repositories";

/** Tagged so publishing can expire exactly this data (see the admin site-content actions). */
const loadPublishedCached = unstable_cache(
  async (locale: "mn" | "en") => siteContentRepository.findPublished(locale),
  ["site-content-published"],
  { tags: [SITE_CONTENT_CACHE_TAG] },
);

/** Dictionary for every public page that shows editable text, with admin-published text applied. Falls back to built-in text on any failure. */
export function loadPublicDictionary(dictionary: Dictionary, locale: string): Promise<Dictionary> {
  return withPublishedSiteContent(dictionary, locale, loadPublishedCached);
}

/** The request's dictionary (locale from cookie/negotiation) with published admin text applied. Server Components only. */
export async function loadRequestDictionary(): Promise<Dictionary> {
  const locale = await getLocale();
  return loadPublicDictionary(await getDictionary(locale), locale);
}
