import { cache } from "react";

import type { Locale } from "@/i18n/config";
import { getDictionarySync } from "@/i18n/get-dictionary-sync";
import { getLocale } from "@/i18n/get-locale";
import type { Dictionary } from "@/i18n/types";

/**
 * Server Components / Route Handlers only.
 * For Client Components use `@/i18n/get-dictionary-sync` with an explicit locale.
 */
export { getDictionarySync } from "@/i18n/get-dictionary-sync";

const getDictionaryCached = cache(async (locale: Locale): Promise<Dictionary> => {
  return getDictionarySync(locale);
});

export async function getDictionary(locale?: Locale): Promise<Dictionary> {
  const resolved = locale ?? (await getLocale());
  return getDictionaryCached(resolved);
}
