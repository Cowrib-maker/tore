import { env } from "@/lib/env";

/**
 * The one canonical source for this app's own absolute origin —
 * `https://tore.mn` in production, `http://localhost:3000` in local dev
 * (see env-schema.ts's NEXT_PUBLIC_APP_URL entry for how each is
 * validated/required).
 *
 * Every call site that needs to build an absolute URL (a password-reset
 * link, or any future link-based email/webhook/callback) should call this
 * instead of reading `env.NEXT_PUBLIC_APP_URL` directly — one obvious
 * place to look, and one place to hypothetically extend later (e.g. a
 * request-scoped override for a preview deployment) instead of a second,
 * independently-drifting copy of the same read.
 *
 * Deliberately NOT derived from the incoming request's `Host` header —
 * that would let anyone crafting an arbitrary Host header influence a
 * security-relevant link (e.g. a password-reset URL), which is an open-
 * redirect/cache-poisoning-adjacent risk. The app's own configured
 * origin is the only trustworthy source for a link like that.
 */
export function getAppUrl(): string {
  return env.NEXT_PUBLIC_APP_URL;
}

/** Joins `getAppUrl()` with a path, normalizing exactly one `/` between
 * them regardless of whether either side already has one. */
export function buildAppUrl(path: string): string {
  const base = getAppUrl().replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}
