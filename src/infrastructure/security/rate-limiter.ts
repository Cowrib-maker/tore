import { getRedisClient } from "@/infrastructure/security/redis-client";

/**
 * Rate limiter: Redis (REDIS_URL) in production / when configured;
 * in-memory only for development and test isolates.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

function consumeInMemory(
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

async function consumeRedis(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const redis = getRedisClient();
  if (!redis) {
    return consumeInMemory(key, limit, windowMs);
  }

  const redisKey = `tore:rl:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.pexpire(redisKey, windowMs);
  }

  if (count > limit) {
    const ttl = await redis.pttl(redisKey);
    return {
      ok: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((ttl > 0 ? ttl : windowMs) / 1000),
      ),
    };
  }

  return { ok: true };
}

function shouldUseRedis(): boolean {
  if (process.env.NODE_ENV === "test") return false;
  if (process.env.NODE_ENV === "production") return true;
  return Boolean(process.env.REDIS_URL);
}

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  if (shouldUseRedis()) {
    return consumeRedis(key, limit, windowMs);
  }
  return consumeInMemory(key, limit, windowMs);
}

/** Auth registration: 5 attempts / 15 minutes / IP */
export const REGISTER_RATE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };

/** Auth login: 10 attempts / 15 minutes / IP+email */
export const LOGIN_RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };

/** Resend verification: 3 attempts / 15 minutes / IP+email */
export const RESEND_VERIFICATION_RATE_LIMIT = {
  limit: 3,
  windowMs: 15 * 60 * 1000,
};

/** Password reset request: 5 attempts / 15 minutes / IP+email */
export const PASSWORD_RESET_REQUEST_RATE_LIMIT = {
  limit: 5,
  windowMs: 15 * 60 * 1000,
};

/** Password reset submit: 10 attempts / 15 minutes / IP */
export const PASSWORD_RESET_SUBMIT_RATE_LIMIT = {
  limit: 10,
  windowMs: 15 * 60 * 1000,
};

/** Booking requests: 20 attempts / 15 minutes / user */
export const BOOKING_CREATE_RATE_LIMIT = {
  limit: 20,
  windowMs: 15 * 60 * 1000,
};

/** Booking accept/decline: 40 attempts / 15 minutes / user */
export const BOOKING_RESPOND_RATE_LIMIT = {
  limit: 40,
  windowMs: 15 * 60 * 1000,
};

/** Credentials authorize (Auth.js path): 20 attempts / 15 minutes / email */
export const CREDENTIALS_AUTH_RATE_LIMIT = {
  limit: 20,
  windowMs: 15 * 60 * 1000,
};

/** Profile / taxonomy writes: 30 / 15 minutes / user */
export const PROFILE_WRITE_RATE_LIMIT = {
  limit: 30,
  windowMs: 15 * 60 * 1000,
};

/** Offerings mutations: 40 / 15 minutes / user */
export const OFFERING_WRITE_RATE_LIMIT = {
  limit: 40,
  windowMs: 15 * 60 * 1000,
};

/** Availability mutations: 60 / 15 minutes / user */
export const AVAILABILITY_WRITE_RATE_LIMIT = {
  limit: 60,
  windowMs: 15 * 60 * 1000,
};

/** Credential submit: 10 / 15 minutes / user */
export const CREDENTIAL_SUBMIT_RATE_LIMIT = {
  limit: 10,
  windowMs: 15 * 60 * 1000,
};

/** Admin credential review: 60 / 15 minutes / user */
export const CREDENTIAL_REVIEW_RATE_LIMIT = {
  limit: 60,
  windowMs: 15 * 60 * 1000,
};

/** Notification mark-read: 60 / 15 minutes / user */
export const NOTIFICATION_WRITE_RATE_LIMIT = {
  limit: 60,
  windowMs: 15 * 60 * 1000,
};

/** Legal AI chat: 30 requests / 15 minutes / user */
export const LEGAL_AI_CHAT_RATE_LIMIT = {
  limit: 30,
  windowMs: 15 * 60 * 1000,
};

export function legalAiChatRateLimitKey(userId: string): string {
  return `ai-chat:${userId}`;
}

/** Legal AI document upload: 10 / 15 minutes / user */
export const LEGAL_AI_DOCUMENT_RATE_LIMIT = {
  limit: 10,
  windowMs: 15 * 60 * 1000,
};

export function legalAiDocumentRateLimitKey(userId: string): string {
  return `ai-document:${userId}`;
}

/** Public homepage feedback: 5 / 15 minutes / IP */
export const HOMEPAGE_FEEDBACK_RATE_LIMIT = {
  limit: 5,
  windowMs: 15 * 60 * 1000,
};
