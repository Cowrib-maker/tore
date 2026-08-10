import { afterEach, describe, expect, it } from "vitest";

import { assertProductionEnvGuards } from "@/lib/env-guards";
import type { Env } from "@/lib/env-schema";

function prodEnv(overrides: Partial<Env> = {}): Env {
  return {
    DATABASE_URL: "postgresql://localhost/tore",
    AUTH_SECRET: "test-auth-secret-minimum-32-characters",
    AUTH_URL: "https://tore.mn",
    NEXT_PUBLIC_APP_NAME: "TORE",
    NEXT_PUBLIC_APP_URL: "https://tore.mn",
    NODE_ENV: "production",
    FILE_STORAGE: "s3",
    FILE_STORAGE_LOCAL_ROOT: ".data/uploads",
    S3_BUCKET: "tore",
    S3_REGION: "ap-southeast-1",
    S3_ACCESS_KEY_ID: "key",
    S3_SECRET_ACCESS_KEY: "secret",
    REDIS_URL: "redis://localhost:6379",
    EMAIL_PROVIDER: "auto",
    EMAIL_FROM: "TORE <noreply@tore.mn>",
    EMAIL_VERIFICATION_TTL_HOURS: 24,
    RESEND_API_KEY: "re_live",
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    ...overrides,
  } as Env;
}

const FLAG_KEYS = [
  "TORE_ALLOW_LOCAL_STORAGE",
  "TORE_ALLOW_NO_REDIS",
  "TORE_ALLOW_NO_EMAIL",
  "TORE_ALLOW_INSECURE_URLS",
  "TORE_ALLOW_INSECURE_PROD_URLS",
] as const;

afterEach(() => {
  for (const key of FLAG_KEYS) {
    delete process.env[key];
  }
});

describe("assertProductionEnvGuards", () => {
  it("accepts a fully configured production environment", () => {
    expect(() => assertProductionEnvGuards(prodEnv())).not.toThrow();
  });

  it("requires S3 in production unless TORE_ALLOW_LOCAL_STORAGE=1", () => {
    expect(() =>
      assertProductionEnvGuards(prodEnv({ FILE_STORAGE: "local" })),
    ).toThrow(/FILE_STORAGE=s3/);

    process.env.TORE_ALLOW_LOCAL_STORAGE = "1";
    expect(() =>
      assertProductionEnvGuards(prodEnv({ FILE_STORAGE: "local" })),
    ).not.toThrow();
  });

  it("treats missing or non-1 allow flags as denied", () => {
    process.env.TORE_ALLOW_LOCAL_STORAGE = "true";
    expect(() =>
      assertProductionEnvGuards(prodEnv({ FILE_STORAGE: "local" })),
    ).toThrow(/FILE_STORAGE=s3/);

    process.env.TORE_ALLOW_LOCAL_STORAGE = " 1 ";
    expect(() =>
      assertProductionEnvGuards(prodEnv({ FILE_STORAGE: "local" })),
    ).not.toThrow();

    process.env.TORE_ALLOW_LOCAL_STORAGE = '"1"';
    expect(() =>
      assertProductionEnvGuards(prodEnv({ FILE_STORAGE: "local" })),
    ).not.toThrow();
  });

  it("requires REDIS_URL unless TORE_ALLOW_NO_REDIS=1", () => {
    expect(() =>
      assertProductionEnvGuards(prodEnv({ REDIS_URL: undefined })),
    ).toThrow(/REDIS_URL/);

    process.env.TORE_ALLOW_NO_REDIS = "1";
    expect(() =>
      assertProductionEnvGuards(prodEnv({ REDIS_URL: undefined })),
    ).not.toThrow();
  });

  it("requires email credentials unless TORE_ALLOW_NO_EMAIL=1", () => {
    expect(() =>
      assertProductionEnvGuards(
        prodEnv({
          EMAIL_PROVIDER: "auto",
          RESEND_API_KEY: undefined,
          SMTP_HOST: undefined,
        }),
      ),
    ).toThrow(/email/i);

    process.env.TORE_ALLOW_NO_EMAIL = "1";
    expect(() =>
      assertProductionEnvGuards(
        prodEnv({
          EMAIL_PROVIDER: "console",
          RESEND_API_KEY: undefined,
          SMTP_HOST: undefined,
        }),
      ),
    ).not.toThrow();
  });

  it("requires https URLs unless TORE_ALLOW_INSECURE_URLS=1", () => {
    expect(() =>
      assertProductionEnvGuards(
        prodEnv({
          NEXT_PUBLIC_APP_URL: "http://localhost:3000",
          AUTH_URL: "http://localhost:3000",
        }),
      ),
    ).toThrow(/https/);

    process.env.TORE_ALLOW_INSECURE_URLS = "1";
    expect(() =>
      assertProductionEnvGuards(
        prodEnv({
          NEXT_PUBLIC_APP_URL: "http://localhost:3000",
          AUTH_URL: "http://localhost:3000",
        }),
      ),
    ).not.toThrow();
  });

  it("honors legacy TORE_ALLOW_INSECURE_PROD_URLS", () => {
    process.env.TORE_ALLOW_INSECURE_PROD_URLS = "1";
    expect(() =>
      assertProductionEnvGuards(
        prodEnv({
          NEXT_PUBLIC_APP_URL: "http://localhost:3000",
          AUTH_URL: undefined,
        }),
      ),
    ).not.toThrow();
  });
});
