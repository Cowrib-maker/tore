import {
  AUTH_ACTION_CODE,
  type ActionState,
} from "@/application/common/action-state";
import {
  consumeRateLimit,
  type RateLimitResult,
} from "@/infrastructure/security/rate-limiter";

export type RateLimitConfig = {
  limit: number;
  windowMs: number;
};

export type RateLimitMessageKind = "requests" | "attempts";

export function rateLimitExceeded(
  retryAfterSeconds: number,
  kind: RateLimitMessageKind = "requests",
): ActionState {
  const noun = kind === "attempts" ? "attempts" : "requests";
  return {
    code: AUTH_ACTION_CODE.RATE_LIMITED,
    error: `Too many ${noun}. Try again in ${retryAfterSeconds} seconds.`,
  };
}

/**
 * Returns an ActionState error when limited; otherwise null so the caller continues.
 */
export async function enforceRateLimit(
  key: string,
  config: RateLimitConfig,
  kind: RateLimitMessageKind = "requests",
): Promise<ActionState | null> {
  const rate: RateLimitResult = await consumeRateLimit(
    key,
    config.limit,
    config.windowMs,
  );
  if (!rate.ok) {
    return rateLimitExceeded(rate.retryAfterSeconds, kind);
  }
  return null;
}
