"use client";

import { useLayoutEffect } from "react";

/** Same-origin API paths a preview may still call: the app shell's own session-cookie beacon, which concerns the admin's real session, not the previewed role. */
const SHELL_ALLOWED = new Set(["/api/session/sync"]);

declare global {
  interface Window {
    /** Requests a preview tried to make and that were answered synthetically (for tests and diagnostics). */
    __previewBlockedRequests?: string[];
  }
}

/** A Next.js server-action call is a same-origin POST to the page URL carrying a `Next-Action` header — not under /api. */
function isServerActionCall(input: RequestInfo | URL, init?: RequestInit): boolean {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (new URL(raw, window.location.origin).origin !== window.location.origin) return false;
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    return headers.has("next-action");
  } catch {
    return false;
  }
}

function apiPathOf(input: RequestInfo | URL): string | null {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith("/api/") ? url.pathname : null;
  } catch {
    return null;
  }
}

/**
 * While a preview is on screen, every same-origin /api request and every server-action call is answered locally and never reaches the server, so a previewed component
 * cannot read or change anything even through code that runs inside effects (inert only stops clicks). Components that ask which audience
 * applies get the synthetic context's answer. Installed in a layout effect so it is in place before any previewed component's effect runs.
 */
export function PreviewNetworkGuard({ audience }: { audience: "citizen" | "lawyer" }) {
  useLayoutEffect(() => {
    const original = window.fetch;
    window.__previewBlockedRequests = [];
    window.fetch = (input, init) => {
      if (isServerActionCall(input, init)) {
        window.__previewBlockedRequests?.push("SERVER-ACTION");
        return Promise.resolve(new Response(JSON.stringify({ error: "preview-mode", code: "PREVIEW_MODE" }), { status: 403, headers: { "content-type": "application/json" } }));
      }
      const path = apiPathOf(input);
      if (path === null || SHELL_ALLOWED.has(path)) return original(input, init);
      window.__previewBlockedRequests?.push(`${(init?.method ?? "GET").toUpperCase()} ${path}`);
      const body = path === "/api/ai/entitlement" ? { audience } : { error: "preview-mode", code: "PREVIEW_MODE" };
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: path === "/api/ai/entitlement" ? 200 : 403, headers: { "content-type": "application/json" } }),
      );
    };
    return () => {
      window.fetch = original;
    };
  }, [audience]);
  return null;
}
