import type { Locale } from "@/i18n/config";
import { getDictionarySync } from "@/i18n/get-dictionary-sync";
import { getLocale } from "@/i18n/get-locale";
import type { Dictionary } from "@/i18n/types";

/**
 * Server Components / Route Handlers only.
 * For Client Components use `@/i18n/get-dictionary-sync` with an explicit locale.
 */
export { getDictionarySync } from "@/i18n/get-dictionary-sync";

export async function getDictionary(locale?: Locale): Promise<Dictionary> {
  const resolved = locale ?? (await getLocale());
  return getDictionarySync(resolved);
}
