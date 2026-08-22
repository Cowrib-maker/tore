"use client";

import { useEffect } from "react";

/**
 * Registers / refreshes the lawyer device session cookie.
 * A session is not a seat; multiple personal devices are allowed.
 */
export function DeviceSessionBeacon() {
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/lawyer/sessions/touch", {
      method: "POST",
      credentials: "same-origin",
      signal: controller.signal,
    }).catch(() => {
      // Beacon is best-effort; AI routes still touch the session.
    });
    return () => controller.abort();
  }, []);

  return null;
}
