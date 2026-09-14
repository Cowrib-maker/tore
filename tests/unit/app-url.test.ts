import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Password-reset production-bug fix, hotfix round 2 (TORE.MN production-
 * readiness mission).
 *
 * Round 1 made NEXT_PUBLIC_APP_URL required-with-no-default specifically
 * in production, at the zod-schema level (env-schema.ts). That correctly
 * rejected a deploy that forgot to set it — but env.ts's top-level
 * `export const env = validateEnv()` runs the moment the module is
 * imported, and `next build` imports it transitively while statically
 * collecting page data for `/_not-found` — with NODE_ENV=production for
 * the whole build, regardless of what the deploy's runtime configuration
 * will later be. Unlike the pre-existing assertProductionEnvGuards check
 * (env-guards.ts), the new zod-level requirement had NO bypass-flag
 * escape hatch, so it broke `npm run build` on this repo's own dev/CI
 * config (which already relies on TORE_ALLOW_INSECURE_URLS=1 — confirmed
 * by reading .env.example and .github/workflows/ci.yml).
 *
 * Fix (see src/lib/app-url.ts's own doc comment for the full story):
 * env-schema.ts's NEXT_PUBLIC_APP_URL always parses successfully again
 * (same http://localhost:3000 default it always had). The actual "must
 * not silently be localhost in production" enforcement now lives
 * explicitly in getAppUrl() too — empirically, this is REDUNDANT with
 * assertProductionEnvGuards' own pre-existing check on the same field at
 * the same import-time boundary (verified below: in a production-shaped
 * environment missing both the URL and the bypass flag, `env.ts` itself
 * already throws at import, before getAppUrl() is ever reached) — kept
 * anyway as an explicit, self-documenting guarantee at the one call site
 * that needs it today.
 *
 * Every test that needs a specific NODE_ENV/env combination uses
 * vi.resetModules() + vi.stubEnv()/direct process.env mutation before a
 * fresh dynamic import, since env.ts's `env` singleton is computed once
 * at first import from whatever process.env held at that moment.
 */

const FLAG_KEYS = [
  "TORE_ALLOW_INSECURE_URLS",
  "TORE_ALLOW_INSECURE_PROD_URLS",
  "TORE_ALLOW_LOCAL_STORAGE",
  "TORE_ALLOW_LOCAL_ARCHIVE",
  "TORE_ALLOW_NO_REDIS",
  "TORE_ALLOW_NO_EMAIL",
] as const;

afterEach(() => {
  for (const key of FLAG_KEYS) delete process.env[key];
  vi.unstubAllEnvs();
  delete process.env.NEXT_PUBLIC_APP_URL;
  vi.resetModules();
});

/** Stubs a production-SHAPED environment (auth secret + the non-URL MVP
 * bypass flags this test file doesn't care about) so only NEXT_PUBLIC_APP_URL
 * and the insecure-URL bypass flag vary per test. */
function stubProductionShapedEnv(options: { allowInsecureUrls?: boolean } = {}) {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-minimum-32-characters");
  vi.stubEnv("AUTH_URL", "https://tore.mn");
  process.env.TORE_ALLOW_LOCAL_STORAGE = "1";
  process.env.TORE_ALLOW_LOCAL_ARCHIVE = "1";
  process.env.TORE_ALLOW_NO_REDIS = "1";
  process.env.TORE_ALLOW_NO_EMAIL = "1";
  if (options.allowInsecureUrls) {
    process.env.TORE_ALLOW_INSECURE_URLS = "1";
  }
}

describe("1. development URL generation", () => {
  it("returns the localhost default outside production without any check firing", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_SECRET", "test-auth-secret-minimum-32-characters");
    delete process.env.NEXT_PUBLIC_APP_URL;
    const { getAppUrl } = await import("@/lib/app-url");
    expect(getAppUrl()).toBe("http://localhost:3000");
  });
});

describe("2. production URL generation with a valid canonical origin", () => {
  it("returns https://tore.mn unchanged, with no bypass flag needed", async () => {
    vi.resetModules();
    stubProductionShapedEnv();
    process.env.NEXT_PUBLIC_APP_URL = "https://tore.mn";
    const { getAppUrl } = await import("@/lib/app-url");
    expect(getAppUrl()).toBe("https://tore.mn");
  });
});

describe("3/4/5. production, missing/localhost/non-HTTPS URL configuration with no bypass flag — fails closed at import (module boot), the reachable boundary", () => {
  it("missing NEXT_PUBLIC_APP_URL: env.ts itself throws at import, before getAppUrl() is ever reached (defaults to localhost, caught by the https check — http:// is checked before the loopback-hostname check)", async () => {
    vi.resetModules();
    stubProductionShapedEnv();
    delete process.env.NEXT_PUBLIC_APP_URL;
    await expect(import("@/lib/env")).rejects.toThrow(/https/);
  });

  it("explicit http://localhost URL: same import-time failure (https checked first, matching the pre-existing assertProductionEnvGuards order)", async () => {
    vi.resetModules();
    stubProductionShapedEnv();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await expect(import("@/lib/env")).rejects.toThrow(/https/);
  });

  it("explicit https://localhost: passes the https check but fails the loopback-hostname check", async () => {
    vi.resetModules();
    stubProductionShapedEnv();
    process.env.NEXT_PUBLIC_APP_URL = "https://localhost:3000";
    await expect(import("@/lib/env")).rejects.toThrow(/must not point to localhost/);
  });

  it("explicit http://127.0.0.1: same as any http:// value — the https check fires first", async () => {
    vi.resetModules();
    stubProductionShapedEnv();
    process.env.NEXT_PUBLIC_APP_URL = "http://127.0.0.1:3000";
    await expect(import("@/lib/env")).rejects.toThrow(/https/);
  });

  it("real domain over plain http (not localhost, but not https either): same import-time failure", async () => {
    vi.resetModules();
    stubProductionShapedEnv();
    process.env.NEXT_PUBLIC_APP_URL = "http://tore.mn";
    await expect(import("@/lib/env")).rejects.toThrow(/https/);
  });

  it("getAppUrl()'s own check, exercised directly (bypassing env.ts's import-time guard) still rejects the same bad values — proves the redundant check is correct on its own, not just untested dead code", async () => {
    vi.resetModules();
    stubProductionShapedEnv({ allowInsecureUrls: true }); // let module import succeed
    process.env.NEXT_PUBLIC_APP_URL = "https://localhost:3000"; // https + loopback -> exercises getAppUrl's loopback branch specifically
    const { getAppUrl } = await import("@/lib/app-url");
    delete process.env.TORE_ALLOW_INSECURE_URLS; // now remove the bypass before calling
    expect(() => getAppUrl()).toThrow(/must not point to localhost/);
  });
});

describe("production + the existing MVP bypass flag: both layers consistently allow the same (accepted-risk) value", () => {
  it("import succeeds and getAppUrl() returns the URL unchanged when TORE_ALLOW_INSECURE_URLS=1", async () => {
    vi.resetModules();
    stubProductionShapedEnv({ allowInsecureUrls: true });
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    const { getAppUrl } = await import("@/lib/app-url");
    expect(getAppUrl()).toBe("http://localhost:3000");
  });
});

describe("6. attacker-controlled Host header cannot alter the reset URL", () => {
  it("getAppUrl takes no request/header input at all — structurally incapable of reading a Host header", async () => {
    vi.resetModules();
    stubProductionShapedEnv();
    process.env.NEXT_PUBLIC_APP_URL = "https://tore.mn";
    const { getAppUrl } = await import("@/lib/app-url");
    // The function's own arity proves it: it accepts nothing to read a
    // Host header FROM. It only ever reads the server's own validated
    // env.NEXT_PUBLIC_APP_URL — see app-url.ts's own comment for why
    // that's a deliberate security property, not an omission.
    expect(getAppUrl.length).toBe(0);
    expect(getAppUrl()).toBe("https://tore.mn");
  });
});

describe("buildAppUrl", () => {
  it("joins the origin and a path with exactly one slash, regardless of leading/trailing slashes", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_SECRET", "test-auth-secret-minimum-32-characters");
    delete process.env.NEXT_PUBLIC_APP_URL;
    const { buildAppUrl } = await import("@/lib/app-url");
    expect(buildAppUrl("/reset-password")).toBe("http://localhost:3000/reset-password");
    expect(buildAppUrl("reset-password")).toBe("http://localhost:3000/reset-password");
  });
});

describe("8. envSchema itself never fails to parse because of NEXT_PUBLIC_APP_URL, in any NODE_ENV (the actual build-regression fix)", () => {
  it("production, var absent: schema parses fine (defaults to localhost) — the security check moved to getAppUrl()/assertProductionEnvGuards, not here", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    const { envSchema } = await import("@/lib/env-schema");
    const parsed = envSchema.safeParse({
      DATABASE_URL: "postgresql://localhost/tore",
      AUTH_SECRET: "test-auth-secret-minimum-32-characters",
      NODE_ENV: "production",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("development: still defaults to http://localhost:3000 when unset", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    const { envSchema } = await import("@/lib/env-schema");
    const parsed = envSchema.safeParse({
      DATABASE_URL: "postgresql://localhost/tore",
      AUTH_SECRET: "test-auth-secret-minimum-32-characters",
      NODE_ENV: "development",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });
});
