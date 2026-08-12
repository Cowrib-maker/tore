import { createHash, randomBytes } from "node:crypto";

/** Prefix so password-reset tokens never collide with email-verification rows. */
export const PASSWORD_RESET_IDENTIFIER_PREFIX = "pwdreset:";

export const PASSWORD_RESET_TOKEN_BYTES = 32;
export const PASSWORD_RESET_TTL_HOURS = 1;

export function passwordResetIdentifier(email: string): string {
  return `${PASSWORD_RESET_IDENTIFIER_PREFIX}${email.trim().toLowerCase()}`;
}

export function parsePasswordResetIdentifier(
  identifier: string,
): string | null {
  if (!identifier.startsWith(PASSWORD_RESET_IDENTIFIER_PREFIX)) {
    return null;
  }
  return identifier.slice(PASSWORD_RESET_IDENTIFIER_PREFIX.length);
}

export function generatePasswordResetRawToken(): string {
  return randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString("hex");
}

export function hashPasswordResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function passwordResetExpiry(
  ttlHours = PASSWORD_RESET_TTL_HOURS,
  now = new Date(),
): Date {
  return new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
}

export function buildPasswordResetUrl(params: {
  appUrl: string;
  rawToken: string;
}): string {
  const base = params.appUrl.replace(/\/$/, "");
  const url = new URL("/reset-password", `${base}/`);
  url.searchParams.set("token", params.rawToken);
  return url.toString();
}
