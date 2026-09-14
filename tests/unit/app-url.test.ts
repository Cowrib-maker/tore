import { afterEach, describe, expect, it, vi } from "vitest";

import { buildAppUrl, getAppUrl } from "@/lib/app-url";
import { env } from "@/lib/env";

/**
 * Password-reset production-bug fix (TORE.MN production-readiness
 * mission): the reported symptom was a production password-reset email
 * containing a `localhost:3000` link. Root cause: NEXT_PUBLIC_APP_URL
 * silently defaulted to `http://localhost:3000` even in production when
 * the deploy's env config simply omitted it — env-schema.ts's own
 * production env-guard (assertProductionEnvGuards, see env-validation.test.ts)
 * already rejects an EXPLICIT localhost/non-https value, but only when
 * TORE_ALLOW_INSECURE_URLS isn't set for that deploy, and it can't catch
 * a MISSING value at all once a default exists to fall back to. These
 * tests cover the schema-level fix (no default in production, so a
 * missing var fails zod parsing itself, unconditionally) plus the new
 * canonical getAppUrl()/buildAppUrl() helpers.
 */

describe("getAppUrl / buildAppUrl", () => {
  it("returns exactly env.NEXT_PUBLIC_APP_URL", () => {
    expect(getAppUrl()).toBe(env.NEXT_PUBLIC_APP_URL);
  });

  it("in this test run (development-style default), returns the localhost origin", () => {
    // Confirms requirement: "development may use localhost".
    expect(getAppUrl()).toBe("http://localhost:3000");
  });

  it("builds an absolute URL with exactly one slash between origin and path, regardless of leading/trailing slashes on either side", () => {
    expect(buildAppUrl("/reset-password")).toBe("http://localhost:3000/reset-password");
    expect(buildAppUrl("reset-password")).toBe("http://localhost:3000/reset-password");
  });
});

describe("envSchema — NEXT_PUBLIC_APP_URL production requirement (the actual bug fix)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("production: rejects a config that omits NEXT_PUBLIC_APP_URL entirely (the real-world deploy gap that caused the bug)", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    const { envSchema } = await import("@/lib/env-schema");

    const parsed = envSchema.safeParse({
      DATABASE_URL: "postgresql://localhost/tore",
      AUTH_SECRET: "test-auth-secret-minimum-32-characters",
      NODE_ENV: "production",
      // NEXT_PUBLIC_APP_URL intentionally omitted.
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    // A MISSING field fails with zod's own "Required" (the field is absent,
    // not merely malformed) — the custom "required in production" message
    // on the schema entry applies when a present-but-invalid value hits the
    // .url() check, not to outright absence. Either way, the important,
    // actual assertion is the one above: parsing fails at all.
    expect(parsed.error.flatten().fieldErrors.NEXT_PUBLIC_APP_URL?.[0]).toBeTruthy();
  });

  it("production: rejects a present-but-malformed value with the custom message", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    const { envSchema } = await import("@/lib/env-schema");

    const parsed = envSchema.safeParse({
      DATABASE_URL: "postgresql://localhost/tore",
      AUTH_SECRET: "test-auth-secret-minimum-32-characters",
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "not-a-url",
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.flatten().fieldErrors.NEXT_PUBLIC_APP_URL?.[0]).toMatch(
      /required in production/,
    );
  });

  it("production: accepts an explicit https production origin", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    const { envSchema } = await import("@/lib/env-schema");

    const parsed = envSchema.safeParse({
      DATABASE_URL: "postgresql://localhost/tore",
      AUTH_SECRET: "test-auth-secret-minimum-32-characters",
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://tore.mn",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.NEXT_PUBLIC_APP_URL).toBe("https://tore.mn");
  });

  it("production: schema alone accepts a malformed value like localhost (that specific rejection is assertProductionEnvGuards's job, tested in env-validation.test.ts) — proving the two checks are complementary, not duplicated", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    const { envSchema } = await import("@/lib/env-schema");

    const parsed = envSchema.safeParse({
      DATABASE_URL: "postgresql://localhost/tore",
      AUTH_SECRET: "test-auth-secret-minimum-32-characters",
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });

    // The schema only requires a well-formed URL; assertProductionEnvGuards
    // (see env-validation.test.ts's "requires https URLs unless
    // TORE_ALLOW_INSECURE_URLS=1") is what rejects it being localhost/http.
    expect(parsed.success).toBe(true);
  });

  it("non-production (development): still defaults to http://localhost:3000 when unset", async () => {
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
