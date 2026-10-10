import {
  ALL_SITE_CONTENT_DEFINITIONS,
  SITE_CONTENT_LOCALES,
  getSiteContentDefault,
  type SiteContentDefinition,
} from "@/domain/site-content/registry";
import { getDictionarySync } from "@/i18n/get-dictionary-sync";

/**
 * A key is AVAILABLE when its code-owned default exists, as a string, in every editable locale of this build's dictionaries.
 * This keeps one registry valid on every branch: Spell keys appear only where the Spell copy exists, and a key whose text was
 * removed from the dictionaries simply stops being offered (its stored revisions are kept).
 */
export function isSiteContentDefinitionAvailable(definition: SiteContentDefinition): boolean {
  return SITE_CONTENT_LOCALES.every((locale) => typeof getSiteContentDefault(getDictionarySync(locale), definition) === "string");
}

export const SITE_CONTENT_DEFINITIONS: readonly SiteContentDefinition[] = ALL_SITE_CONTENT_DEFINITIONS.filter(isSiteContentDefinitionAvailable);

const AVAILABLE = new Map(SITE_CONTENT_DEFINITIONS.map((d) => [d.key, d]));

/** The only lookup editing code may use: unavailable or unknown keys resolve to undefined and are refused. */
export function getAvailableSiteContentDefinition(key: string): SiteContentDefinition | undefined {
  return AVAILABLE.get(key);
}
