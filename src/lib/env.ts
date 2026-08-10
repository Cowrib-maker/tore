import { assertProductionEnvGuards } from "@/lib/env-guards";
import { envSchema, type Env } from "@/lib/env-schema";

export type { Env } from "@/lib/env-schema";
export { assertProductionEnvGuards } from "@/lib/env-guards";

const nodeEnv = process.env.NODE_ENV ?? "development";

function validateEnv(): Env {
  const parsed = envSchema.safeParse({
    ...process.env,
    NODE_ENV: nodeEnv,
  });

  if (!parsed.success) {
    console.error(
      "Invalid environment variables:",
      parsed.error.flatten().fieldErrors,
    );
    throw new Error("Invalid environment variables");
  }

  const env = parsed.data;
  assertProductionEnvGuards(env);
  return env;
}

/** Validated env — import from boot paths so validation always runs. */
export const env = validateEnv();
