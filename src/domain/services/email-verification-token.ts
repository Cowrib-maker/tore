import { createHash, randomBytes } from "node:crypto";

export const EMAIL_VERIFICATION_TOKEN_BYTES = 32;

export function generateEmailVerificationRawToken(): string {
  return randomBytes(EMAIL_VERIFICATION_TOKEN_BYTES).toString("hex");
}

export function hashEmailVerificationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function buildEmailVerificationUrl(params: {
  appUrl: string;
  rawToken: string;
}): string {
  const base = params.appUrl.replace(/\/$/, "");
  const url = new URL("/verify-email", `${base}/`);
  url.searchParams.set("token", params.rawToken);
  return url.toString();
}

export function emailVerificationExpiry(ttlHours: number, now = new Date()): Date {
  return new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
}
