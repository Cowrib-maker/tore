import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

export const GUEST_SESSION_COOKIE = "tore_guest_session";
export const GUEST_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Server-derived, privacy-preserving guest trial identity. The caller supplies
 * an already keyed IP hash; user agent only narrows shared-NAT collisions.
 */
export function hashGuestTrialIdentity(
  ipHash: string | null,
  userAgent: string | null,
): string | null {
  if (!ipHash) return null;
  return createHmac("sha256", env.AUTH_SECRET)
    .update(`${ipHash}:${userAgent?.slice(0, 512) ?? ""}`)
    .digest("hex");
}

export function signGuestCookieValue(sessionId: string, token: string): string {
  const payload = `${sessionId}.${token}`;
  const signature = createHmac("sha256", env.AUTH_SECRET)
    .update(payload)
    .digest("hex");
  return `${payload}.${signature}`;
}

export function parseGuestCookieValue(
  raw: string | undefined,
): { sessionId: string; token: string } | null {
  if (!raw) {
    return null;
  }
  const parts = raw.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [sessionId, token, signature] = parts;
  if (!sessionId || !token || !signature) {
    return null;
  }
  const expected = createHmac("sha256", env.AUTH_SECRET)
    .update(`${sessionId}.${token}`)
    .digest("hex");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }
  return { sessionId, token };
}

export function newGuestToken(): string {
  return randomBytes(32).toString("hex");
}

export function guestCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}
