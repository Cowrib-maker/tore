import { cache } from "react";
import { cookies, headers } from "next/headers";

import { LOCALE_COOKIE, localeMeta, type Locale } from "@/i18n/config";
import { resolveLocale } from "@/i18n/negotiate";

/**
 * Server-only locale resolution (cookies + Accept-Language via next/headers).
 * Do not import from Client Components — use `@/i18n/client-locale` instead.
 * Cached per React request.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const cookieStore = await cookies();
  const headerStore = await headers();
  return resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerStore.get("accept-language"),
  );
});

export async function getHtmlLang(): Promise<string> {
  const locale = await getLocale();
  return localeMeta[locale].htmlLang;
}
