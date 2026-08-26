import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

export const EMAIL_VERIFICATION_TOKEN_BYTES = 32;
export const EMAIL_VERIFICATION_OTP_LENGTH = 6;
export const EMAIL_VERIFICATION_OTP_TTL_MINUTES = 10;
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = 59;

export function generateEmailVerificationRawToken(): string {
  return randomBytes(EMAIL_VERIFICATION_TOKEN_BYTES).toString("hex");
}

/** Cryptographically random 6-digit code, zero-padded. */
export function generateEmailVerificationOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(
    EMAIL_VERIFICATION_OTP_LENGTH,
    "0",
  );
}

export function normalizeEmailVerificationOtp(value: string): string {
  return value.replace(/\D/g, "").slice(0, EMAIL_VERIFICATION_OTP_LENGTH);
}

export function isCompleteEmailVerificationOtp(value: string): boolean {
  return /^\d{6}$/.test(value);
}

export function hashEmailVerificationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/**
 * Bind the OTP to the account email so the stored digest is not a bare 6-digit
 * hash. The plaintext code is never persisted.
 */
export function hashEmailVerificationOtp(email: string, otp: string): string {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedOtp = normalizeEmailVerificationOtp(otp);
  return hashEmailVerificationToken(`${normalizedEmail}:${normalizedOtp}`);
}

export function emailVerificationHashesMatch(
  left: string,
  right: string,
): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function emailVerificationOtpExpiry(
  ttlMinutes: number = EMAIL_VERIFICATION_OTP_TTL_MINUTES,
  now = new Date(),
): Date {
  return new Date(now.getTime() + ttlMinutes * 60 * 1000);
}

/** @deprecated URL tokens are no longer issued; kept for older tests/helpers. */
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

export function formatResendCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
