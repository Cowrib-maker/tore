import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

/**
 * Cookie-capable session refresh.
 *
 * `auth()` called with zero arguments (the form every Server Component uses)
 * cannot forward a refreshed session's Set-Cookie header — Next.js does not
 * let a Server Component write response cookies during render. Any
 * bind-new/bind-token decision `decideActiveSession` makes during that call
 * still mutates `activeSessionIdHash` in the database, but the browser never
 * receives the matching cookie, so the next request looks like the session
 * was replaced.
 *
 * Wrapping `auth()` in a handler function (the same form next-auth uses for
 * middleware and Route Handlers) runs through `handleAuth`, which does
 * forward the session response's Set-Cookie header onto the returned
 * response. SessionSyncBeacon calls this route once per page load so any
 * cookie refresh from the preceding Server Component render actually reaches
 * the browser.
 */
export const POST = auth(() => NextResponse.json({ ok: true }));
