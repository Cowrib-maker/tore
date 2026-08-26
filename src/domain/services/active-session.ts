import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const ACTIVE_SESSION_ID_BYTES = 32;

export {
  SESSION_REPLACED_CODE,
  SESSION_REPLACED_HINT,
  SESSION_REPLACED_LOGIN_REASON,
  SESSION_REPLACED_MESSAGE,
  isSessionReplacedLoginReason,
  sessionReplacedLoginPath,
} from "@/domain/services/active-session-constants";

export function generateActiveSessionId(): string {
  return randomBytes(ACTIVE_SESSION_ID_BYTES).toString("hex");
}

export function hashActiveSessionId(rawSessionId: string): string {
  return createHash("sha256").update(rawSessionId, "utf8").digest("hex");
}

export function activeSessionHashesMatch(
  leftHash: string,
  rightHash: string,
): boolean {
  const a = Buffer.from(leftHash, "utf8");
  const b = Buffer.from(rightHash, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type ActiveSessionDecision =
  | { action: "ok" }
  | { action: "replaced" }
  | { action: "bind-token" }
  | { action: "bind-new" };

/**
 * Compare the JWT session identifier with the hash stored on the user.
 * Legacy JWTs (no sid) bind on first Node request after deploy when the DB
 * value is still null; a later login or bind from another device replaces them.
 */
export function decideActiveSession(
  tokenSid: string | undefined,
  storedHash: string | null,
): ActiveSessionDecision {
  const sid = tokenSid?.trim() || undefined;
  const hash = storedHash?.trim() || null;

  if (sid && hash) {
    return activeSessionHashesMatch(hashActiveSessionId(sid), hash)
      ? { action: "ok" }
      : { action: "replaced" };
  }

  if (!sid && hash) {
    return { action: "replaced" };
  }

  if (sid && !hash) {
    return { action: "bind-token" };
  }

  return { action: "bind-new" };
}
