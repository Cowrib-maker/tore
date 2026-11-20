import { NextResponse } from "next/server";

import { sessionSyncAuth } from "@/infrastructure/auth";

/**
 * Cookie-capable session refresh.
 *
 * `auth()` called with zero arguments (the form every Server Component uses)
 * cannot forward a refreshed session's Set-Cookie header — Next.js does not
 * let a Server Component write response cookies during render. The regular
 * auth() callback is deliberately read-only for legacy-session binding. This
 * dedicated Auth.js instance performs a deterministic compare-and-swap bind
 * and forwards the matching refreshed cookie.
 *
 * Wrapping `auth()` in a handler function (the same form next-auth uses for
 * middleware and Route Handlers) runs through `handleAuth`, which does
 * forward the session response's Set-Cookie header onto the returned
 * response. SessionSyncBeacon calls this route once per page load so any
 * cookie refresh from the preceding Server Component render actually reaches
 * the browser.
 */
export const POST = sessionSyncAuth(() => NextResponse.json({ ok: true }));
