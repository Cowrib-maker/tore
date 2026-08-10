import type { Env } from "@/lib/env-schema";

/** Explicit MVP / exceptional-deploy bypass — must be exactly "1" (after trim). */
export function allowFlag(name: string): boolean {
  const raw = process.env[name];
  if (raw == null) return false;
  // Strip optional surrounding quotes / whitespace from dotenv-style values.
  // Still requires the semantic value to be exactly 1 — empty / true / yes stay false.
  const normalized = raw.trim().replace(/^['"]|['"]$/g, "");
  return normalized === "1";
}

/**
 * Production infrastructure gates.
 * Bypass only when the matching TORE_ALLOW_* flag is exactly "1".
 */
export function assertProductionEnvGuards(env: Env): void {
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

  if (
    env.NODE_ENV === "production" &&
    env.FILE_STORAGE !== "s3" &&
    !allowFlag("TORE_ALLOW_LOCAL_STORAGE")
  ) {
    throw new Error(
      "Production requires FILE_STORAGE=s3 (set TORE_ALLOW_LOCAL_STORAGE=1 only for exceptional deploys)",
    );
  }

  if (
    env.NODE_ENV === "production" &&
    !env.REDIS_URL &&
    !allowFlag("TORE_ALLOW_NO_REDIS")
  ) {
    throw new Error(
      "Production requires REDIS_URL for shared rate limiting across instances (set TORE_ALLOW_NO_REDIS=1 for MVP single-instance)",
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
    !env.SMTP_HOST &&
    !allowFlag("TORE_ALLOW_NO_EMAIL")
  ) {
    throw new Error(
      "Production email requires RESEND_API_KEY (preferred) or SMTP_HOST (set TORE_ALLOW_NO_EMAIL=1 for MVP)",
    );
  }

  if (
    env.NODE_ENV === "production" &&
    env.EMAIL_PROVIDER === "console" &&
    !allowFlag("TORE_ALLOW_NO_EMAIL")
  ) {
    throw new Error(
      "EMAIL_PROVIDER=console is not allowed in production; use auto/resend/smtp (set TORE_ALLOW_NO_EMAIL=1 for MVP)",
    );
  }

  const allowInsecureUrls =
    allowFlag("TORE_ALLOW_INSECURE_URLS") ||
    allowFlag("TORE_ALLOW_INSECURE_PROD_URLS");

  if (env.NODE_ENV === "production" && !allowInsecureUrls) {
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
}
