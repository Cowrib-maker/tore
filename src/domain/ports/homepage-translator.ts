import type { HomepageLandingContent } from "@/domain/entities/homepage-content";
import type { Locale } from "@/i18n/config";

export type TranslatableLocale = Exclude<Locale, "mn">;

export type HomepageTranslationResult = Partial<
  Record<TranslatableLocale, HomepageLandingContent>
>;

/**
 * Machine-translates the admin-edited Mongolian homepage content into the
 * platform's other supported locales. Never called for "mn" itself —
 * that is the source of truth the admin edits directly.
 */
export interface HomepageTranslatorPort {
  isConfigured(): boolean;
  translate(
    source: HomepageLandingContent,
    targetLocales: TranslatableLocale[],
  ): Promise<HomepageTranslationResult>;
}
