"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { setLocaleAction } from "@/application/actions/locale.actions";
import type { Locale } from "@/i18n/config";
import { readStoredLocale, writeStoredLocale } from "@/i18n/client-storage";

/**
 * Keeps cookie (SSR) and localStorage aligned without touching routing.
 * - First visit: persist the negotiated server locale into localStorage.
 * - Return visit: if localStorage has a preference the cookie lacks/mismatches, sync cookie.
 */
export function LocalePersistence({ locale }: { locale: Locale }) {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const stored = readStoredLocale();

    if (!stored) {
      writeStoredLocale(locale);
      return;
    }

    if (stored !== locale) {
      void (async () => {
        await setLocaleAction(stored);
        router.refresh();
      })();
      return;
    }

    writeStoredLocale(locale);
  }, [locale, router]);

  return null;
}
