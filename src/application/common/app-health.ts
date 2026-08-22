import { isQpayConfigured } from "@/infrastructure/billing/qpay-config";
import { resolveEmailProvider } from "@/infrastructure/email/resolve-email-provider";
import type { Env } from "@/lib/env-schema";

export type HealthIntegrationFlag = "configured" | "not_configured";
export type HealthEmailProvider = "console" | "resend" | "smtp";

export type AppHealthBody = {
  ok: boolean;
  app: "ok";
  database: "ok" | "error";
  integrations: {
    openai: HealthIntegrationFlag;
    qpay: HealthIntegrationFlag;
    engine: HealthIntegrationFlag;
    redis: HealthIntegrationFlag;
    email: HealthEmailProvider;
  };
};

export type AppHealthResult = {
  status: 200 | 503;
  body: AppHealthBody;
};

function configuredFlag(value: boolean): HealthIntegrationFlag {
  return value ? "configured" : "not_configured";
}

function emailLabel(env: Env): HealthEmailProvider {
  try {
    return resolveEmailProvider(env);
  } catch {
    return "console";
  }
}

export async function buildAppHealth(input: {
  env: Env;
  pingDatabase: () => Promise<boolean>;
}): Promise<AppHealthResult> {
  let databaseOk = false;
  try {
    databaseOk = await input.pingDatabase();
  } catch {
    databaseOk = false;
  }

  const body: AppHealthBody = {
    ok: databaseOk,
    app: "ok",
    database: databaseOk ? "ok" : "error",
    integrations: {
      openai: configuredFlag(Boolean(input.env.OPENAI_API_KEY)),
      qpay: configuredFlag(isQpayConfigured(input.env)),
      engine: configuredFlag(
        Boolean(input.env.ENGINE_BASE_URL && input.env.ENGINE_SERVICE_TOKEN),
      ),
      redis: configuredFlag(Boolean(input.env.REDIS_URL)),
      email: emailLabel(input.env),
    },
  };

  return {
    status: databaseOk ? 200 : 503,
    body,
  };
}
