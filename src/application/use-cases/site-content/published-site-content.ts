import { applySiteContentOverrides, isSiteContentLocale, type SiteContentOverrides } from "@/domain/site-content/registry";
import type { Dictionary } from "@/i18n/types";

export const SITE_CONTENT_CACHE_TAG = "site-content";

/**
 * Applies published overrides for `locale` to `dictionary`. `loadPublished` is injected so the fallback behaviour is testable
 * without Next's cache: if loading fails for ANY reason the code-owned dictionary is returned unchanged — a database or cache
 * problem must never take the public homepage down.
 */
export async function withPublishedSiteContent(
  dictionary: Dictionary,
  locale: string,
  loadPublished: (locale: "mn" | "en") => Promise<SiteContentOverrides>,
): Promise<Dictionary> {
  if (!isSiteContentLocale(locale)) return dictionary;
  try {
    const overrides = await loadPublished(locale);
    return Object.keys(overrides).length === 0 ? dictionary : applySiteContentOverrides(dictionary, overrides);
  } catch (error) {
    console.error("site content: falling back to built-in text", error instanceof Error ? error.message : "unknown error");
    return dictionary;
  }
}
