import { z } from "zod";

const nodeEnv = process.env.NODE_ENV ?? "development";

const baseSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET:
    nodeEnv === "test"
      ? z
          .string()
          .min(32)
          .optional()
          .default("test-auth-secret-minimum-32-characters")
      : z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_NAME: z.string().default("TORE"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  FILE_STORAGE: z.enum(["local", "s3"]).default("local"),
  /** Absolute or process-relative root for local object storage. Never hardcode in app code. */
  FILE_STORAGE_LOCAL_ROOT: z.string().min(1).default(".data/uploads"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  S3_PUBLIC_BASE_URL: z.string().url().optional(),
  /**
   * Redis for distributed rate limiting.
   * Required in production; optional in development (falls back to in-memory).
   */
  REDIS_URL: z.string().url().optional(),
  /** auto (default) | console | resend | smtp — local auto always resolves to console */
  EMAIL_PROVIDER: z
    .enum(["auto", "console", "resend", "smtp"])
    .default("auto"),
  EMAIL_FROM: z.string().min(3).default("TORE <noreply@tore.mn>"),
  EMAIL_VERIFICATION_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(168)
    .default(24),
  RESEND_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
});

export type Env = z.infer<typeof baseSchema>;

function validateEnv(): Env {
  const parsed = baseSchema.safeParse({
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

  if (env.FILE_STORAGE === "s3") {
    const missing: string[] = [];
    if (!env.S3_BUCKET) missing.push("S3_BUCKET");
    if (!env.S3_REGION) missing.push("S3_REGION");
    if (!env.S3_ACCESS_KEY_ID) missing.push("S3_ACCESS_KEY_ID");
    if (!env.S3_SECRET_ACCESS_KEY) missing.push("S3_SECRET_ACCESS_KEY");
    if (missing.length > 0) {
      throw new Error(
        `FILE_STORAGE=s3 requires: ${missing.join(", ")}`,
      );
    }
  }

  // Set TORE_ALLOW_LOCAL_STORAGE=1 only for exceptional non-S3 production deploys.
  if (
    env.NODE_ENV === "production" &&
    env.FILE_STORAGE !== "s3" &&
    process.env.TORE_ALLOW_LOCAL_STORAGE !== "1"
  ) {
    throw new Error(
      "Production requires FILE_STORAGE=s3 (set TORE_ALLOW_LOCAL_STORAGE=1 only for exceptional deploys)",
    );
  }

  if (env.NODE_ENV === "production" && !env.REDIS_URL) {
    throw new Error(
      "Production requires REDIS_URL for shared rate limiting across instances",
    );
  }

  if (env.EMAIL_PROVIDER === "resend" && !env.RESEND_API_KEY) {
    throw new Error("EMAIL_PROVIDER=resend requires RESEND_API_KEY");
  }

  if (env.EMAIL_PROVIDER === "smtp" && !env.SMTP_HOST) {
    throw new Error("EMAIL_PROVIDER=smtp requires SMTP_HOST");
  }

  if (
    env.NODE_ENV === "production" &&
    env.EMAIL_PROVIDER === "auto" &&
    !env.RESEND_API_KEY &&
    !env.SMTP_HOST
  ) {
    throw new Error(
      "Production email requires RESEND_API_KEY (preferred) or SMTP_HOST",
    );
  }

  if (env.NODE_ENV === "production" && env.EMAIL_PROVIDER === "console") {
    throw new Error(
      "EMAIL_PROVIDER=console is not allowed in production; use auto/resend/smtp",
    );
  }

  // Set TORE_ALLOW_INSECURE_PROD_URLS=1 only for local production builds.
  if (
    env.NODE_ENV === "production" &&
    process.env.TORE_ALLOW_INSECURE_PROD_URLS !== "1"
  ) {
    const appUrl = new URL(env.NEXT_PUBLIC_APP_URL);
    if (appUrl.protocol !== "https:") {
      throw new Error("Production NEXT_PUBLIC_APP_URL must use https://");
    }
    if (
      appUrl.hostname === "localhost" ||
      appUrl.hostname === "127.0.0.1" ||
      appUrl.hostname === "::1"
    ) {
      throw new Error(
        "Production NEXT_PUBLIC_APP_URL must not point to localhost",
      );
    }

    if (!env.AUTH_URL) {
      throw new Error(
        "Production requires AUTH_URL (public origin for Auth.js callbacks)",
      );
    }
    const authUrl = new URL(env.AUTH_URL);
    if (authUrl.protocol !== "https:") {
      throw new Error("Production AUTH_URL must use https://");
    }
  }

  return env;
}

/** Validated env — import from boot paths so validation always runs. */
export const env = validateEnv();
