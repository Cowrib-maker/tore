import { z } from "zod";

const nodeEnv = process.env.NODE_ENV ?? "development";

export const envSchema = z.object({
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
  /**
   * Legal-source archive object storage (HttpKnowledgeCrawler / ArchiveService).
   * Distinct purpose from FILE_STORAGE (marketplace uploads).
   */
  ARCHIVE_STORAGE: z.enum(["local", "s3"]).default("local"),
  ARCHIVE_LOCAL_ROOT: z.string().min(1).default(".data/legal-archive"),
  /** Optional key prefix inside the archive bucket (no leading slash). */
  ARCHIVE_S3_PREFIX: z.string().min(1).default("legal-archive"),
  /** Optional dedicated archive bucket; falls back to S3_BUCKET. */
  ARCHIVE_S3_BUCKET: z.string().optional(),
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
   * Required in production unless TORE_ALLOW_NO_REDIS=1 (MVP / single-instance).
   * Optional in development (falls back to in-memory).
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
  /**
   * Internal legal-data-engine HTTP base URL (server-only).
   * Example: http://localhost:8080
   */
  ENGINE_BASE_URL: z.string().url().optional(),
  /** Shared secret for Authorization: Bearer. Never expose to the browser. */
  ENGINE_SERVICE_TOKEN: z.string().min(8).optional(),
  ENGINE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30_000).default(8000),
  /**
   * QPay Merchant V2. Server-only. Sandbox vs production is selected by BASE_URL.
   * Optional until a lawyer starts checkout; then all four plus invoice code are required.
   */
  QPAY_BASE_URL: z.string().url().optional(),
  QPAY_CLIENT_ID: z.string().min(1).optional(),
  QPAY_CLIENT_SECRET: z.string().min(1).optional(),
  QPAY_CALLBACK_URL: z.string().url().optional(),
  /** Merchant invoice_code assigned by QPay. Required to create invoices. */
  QPAY_INVOICE_CODE: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;
