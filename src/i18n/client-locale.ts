import { LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { readStoredLocale } from "@/i18n/client-storage";
import { resolveLocale } from "@/i18n/negotiate";

/**
 * Client-safe locale resolver. Does not use next/headers.
 * Prefer an explicit `locale` prop from a Server Component when available.
 * Order: localStorage → document cookie → browser language → default.
 */
export function resolveClientLocale(): Locale {
  const stored = readStoredLocale();
  if (stored) return stored;

  const cookieValue = readDocumentCookie(LOCALE_COOKIE);
  const acceptLanguage =
    typeof navigator !== "undefined"
      ? (navigator.languages?.join(",") ?? navigator.language ?? null)
      : null;

  return resolveLocale(cookieValue, acceptLanguage);
}

function readDocumentCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp(
      `(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`,
    ),
  );
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}
