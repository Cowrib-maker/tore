"use client";

import { useEffect } from "react";

/**
 * Delivers any pending single-active-session cookie refresh to the browser.
 * Server Components can't set response cookies, so a bind-new/bind-token
 * decision made by `decideActiveSession` during a layout/page `auth()` call
 * mutates the database but leaves the browser holding a stale JWT. This
 * beacon's request goes through /api/session/sync, a Route Handler that
 * invokes `auth()` in the cookie-forwarding form, closing that gap.
 */
export function SessionSyncBeacon() {
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/session/sync", {
      method: "POST",
      credentials: "same-origin",
      signal: controller.signal,
    }).catch(() => {
      // Best-effort; an unsynced cookie is retried on the next page load.
    });
    return () => controller.abort();
  }, []);

  return null;
}
