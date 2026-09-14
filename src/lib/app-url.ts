import { env } from "@/lib/env";
import { allowFlag } from "@/lib/env-guards";

/** Same bypass flags assertProductionEnvGuards already uses for this exact
 * field (env-guards.ts) — reused here, not reinvented, so a deployment
 * that has legitimately opted into the "MVP / exceptional bypass" story
 * doesn't hit two different, inconsistent gates for the same value. */
function insecureAppUrlBypassed(): boolean {
  return allowFlag("TORE_ALLOW_INSECURE_URLS") || allowFlag("TORE_ALLOW_INSECURE_PROD_URLS");
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

/**
 * The one canonical source for this app's own absolute origin —
 * `https://tore.mn` in production, `http://localhost:3000` in local dev.
 *
 * BUILD-REGRESSION HISTORY (read before changing this file again): an
 * earlier fix made env-schema.ts's NEXT_PUBLIC_APP_URL required-with-no-
 * default specifically in production, at the zod-schema level. That
 * schema is evaluated eagerly the moment env.ts is first imported
 * (`export const env = validateEnv()`), and `next build` imports it
 * transitively while statically collecting page data — confirmed
 * empirically: this happens for `/_not-found`, with NODE_ENV=production
 * for the whole build, regardless of what the deploy's runtime
 * configuration will later be. Unlike assertProductionEnvGuards (below),
 * that zod-level check had NO bypass-flag escape hatch at all, so it
 * broke `npm run build` on any environment relying on the existing
 * TORE_ALLOW_INSECURE_URLS convention (confirmed: this repo's own local
 * dev config and CI already rely on it) — a strictly worse regression
 * than the bug it fixed. env-schema.ts's field is back to always
 * parsing successfully; enforcement lives here instead.
 *
 * NOTE ON REDUNDANCY: assertProductionEnvGuards (src/lib/env-guards.ts),
 * called from env.ts right after schema parsing, ALREADY performs this
 * exact https/non-localhost check against NEXT_PUBLIC_APP_URL, with the
 * same bypass flags, at that same eager import-time point — confirmed
 * empirically (a production-shaped env missing this var and the bypass
 * flag makes `env.ts` itself throw at import, before this function is
 * ever reached). The check below is therefore not reachable as an
 * independent code path in that scenario; it's kept anyway as an
 * explicit, self-documenting guarantee at the one call site that most
 * directly needs it (password-reset link construction today), so this
 * property stays true here even if assertProductionEnvGuards' own
 * checks are ever refactored for unrelated reasons.
 *
 * Deliberately NOT derived from the incoming request's `Host` header —
 * that would let anyone crafting an arbitrary Host header influence a
 * security-relevant link (e.g. a password-reset URL), which is an open-
 * redirect/cache-poisoning-adjacent risk. The app's own configured
 * origin is the only trustworthy source for a link like that.
 */
export function getAppUrl(): string {
  const url = env.NEXT_PUBLIC_APP_URL;

  if (env.NODE_ENV === "production" && !insecureAppUrlBypassed()) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(
        "NEXT_PUBLIC_APP_URL is not a valid URL in production. Set it to the canonical https origin (e.g. https://tore.mn), or set TORE_ALLOW_INSECURE_URLS=1 only for an exceptional/MVP deploy.",
      );
    }
    if (parsed.protocol !== "https:") {
      throw new Error(
        "NEXT_PUBLIC_APP_URL must use https:// in production. Set it to the canonical origin (e.g. https://tore.mn), or set TORE_ALLOW_INSECURE_URLS=1 only for an exceptional/MVP deploy.",
      );
    }
    if (isLoopbackHostname(parsed.hostname)) {
      throw new Error(
        "NEXT_PUBLIC_APP_URL must not point to localhost in production. Set it to the canonical origin (e.g. https://tore.mn), or set TORE_ALLOW_INSECURE_URLS=1 only for an exceptional/MVP deploy.",
      );
    }
  }

  return url;
}

/** Joins `getAppUrl()` with a path, normalizing exactly one `/` between
 * them regardless of whether either side already has one. */
export function buildAppUrl(path: string): string {
  const base = getAppUrl().replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}
