import type { HomepageLandingContent } from "@/domain/entities/homepage-content";
import type { Locale } from "@/i18n/config";
import { homepageContentRepository } from "@/infrastructure/repositories";

/**
 * Public read used by the marketing homepage. Returns the admin-edited
 * override for `locale`, or `null` when no admin edit exists yet — callers
 * fall back to the static dictionary in that case.
 */
export async function getHomepageContentOverride(
  locale: Locale,
): Promise<HomepageLandingContent | null> {
  const record = await homepageContentRepository.findByLocale(locale);
  return record?.content ?? null;
}
