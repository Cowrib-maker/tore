/**
 * Best-effort in-memory rate limiter (per server isolate).
 * Suitable as a first line of defense for login/register until a shared store exists.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000),
      ),
    };
  }

  existing.count += 1;
  return { ok: true };
}

/** Auth registration: 5 attempts / 15 minutes / IP */
export const REGISTER_RATE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };

/** Auth login: 10 attempts / 15 minutes / IP+email */
export const LOGIN_RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };
