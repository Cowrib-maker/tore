import { describe, expect, it } from "vitest";

import { buildAppHealth } from "@/application/common/app-health";
import type { Env } from "@/lib/env-schema";

function envStub(overrides: Partial<Env> = {}): Env {
  return {
    DATABASE_URL: "postgresql://secret-user:secret-pass@db.internal:5432/tore",
    AUTH_SECRET: "test-auth-secret-minimum-32-characters",
    NEXT_PUBLIC_APP_NAME: "TORE",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NODE_ENV: "test",
    FILE_STORAGE: "local",
    FILE_STORAGE_LOCAL_ROOT: ".data/uploads",
    ARCHIVE_STORAGE: "local",
    ARCHIVE_LOCAL_ROOT: ".data/legal-archive",
    ARCHIVE_S3_PREFIX: "legal-archive",
    EMAIL_PROVIDER: "auto",
    EMAIL_FROM: "TORE <noreply@tore.mn>",
    EMAIL_VERIFICATION_TTL_HOURS: 24,
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    QPAY_BASE_URL: "https://merchant-sandbox.qpay.mn",
    ...overrides,
  } as Env;
}

describe("buildAppHealth", () => {
  it("returns HTTP 200 shape with configuration flags only", async () => {
    const result = await buildAppHealth({
      env: envStub({
        OPENAI_API_KEY: "sk-live-should-never-appear",
        REDIS_URL: "redis://:redis-secret@localhost:6379",
        ENGINE_BASE_URL: "http://localhost:8080",
        ENGINE_SERVICE_TOKEN: "engine-secret-token",
        QPAY_CLIENT_ID: "qpay-client-id",
        QPAY_CLIENT_SECRET: "qpay-client-secret",
        QPAY_CALLBACK_URL: "https://tore.test/api/billing/qpay/callback",
        QPAY_INVOICE_CODE: "SOLO_INVOICE",
        RESEND_API_KEY: "re_live_secret",
        EMAIL_PROVIDER: "resend",
      }),
      pingDatabase: async () => true,
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      ok: true,
      app: "ok",
      database: "ok",
      integrations: {
        openai: "configured",
        qpay: "configured",
        engine: "configured",
        redis: "configured",
        email: "resend",
      },
    });

    const serialized = JSON.stringify(result.body);
    expect(serialized).not.toMatch(/sk-live|qpay-client|engine-secret|redis-secret|re_live|AUTH_SECRET|DATABASE_URL|postgresql:\/\//i);
  });

  it("returns HTTP 503 when the database ping fails without leaking credentials", async () => {
    const result = await buildAppHealth({
      env: envStub({
        DATABASE_URL: "postgresql://boom:secret@hidden-host/tore",
        OPENAI_API_KEY: undefined,
      }),
      pingDatabase: async () => {
        throw new Error("connect ECONNREFUSED postgresql://boom:secret@hidden-host/tore");
      },
    });

    expect(result.status).toBe(503);
    expect(result.body.ok).toBe(false);
    expect(result.body.app).toBe("ok");
    expect(result.body.database).toBe("error");
    expect(result.body.integrations.openai).toBe("not_configured");
    expect(result.body.integrations.qpay).toBe("not_configured");

    const serialized = JSON.stringify(result.body);
    expect(serialized).not.toContain("hidden-host");
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toMatch(/ECONNREFUSED|stack|at /);
  });
});
