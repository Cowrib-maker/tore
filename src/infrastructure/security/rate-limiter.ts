import { createHash } from "node:crypto";

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

/**
 * One atomic step: increment, and (re)arm the TTL when this is the first hit
 * OR the key has no TTL (PTTL == -1, e.g. left behind by an older
 * INCR-then-PEXPIRE sequence that was interrupted). Returns {count, ttlMs}.
 * Running as a single script means a dropped connection can no longer leave a
 * counter that never expires.
 */
const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if count == 1 or ttl == -1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

export const RATE_LIMIT_SCRIPT_SHA = createHash("sha1")
  .update(RATE_LIMIT_SCRIPT)
  .digest("hex");

/** The two Redis commands the limiter needs; a real ioredis client satisfies it. */
export type RateLimitRedis = {
  evalsha(
    sha: string,
    numKeys: number,
    ...args: Array<string | number>
  ): Promise<unknown>;
  eval(
    script: string,
    numKeys: number,
    ...args: Array<string | number>
  ): Promise<unknown>;
};

let injectedRedis: RateLimitRedis | undefined;

/** Test seam: route the Redis path through a fake. Refused in production. */
export function setRateLimitRedisForTesting(
  redis: RateLimitRedis | undefined,
): void {
  if (redis && process.env.NODE_ENV === "production") {
    throw new Error("setRateLimitRedisForTesting is not available in production");
  }
  injectedRedis = redis;
}

function isNoScriptError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("NOSCRIPT");
}

async function runRateLimitScript(
  redis: RateLimitRedis,
  redisKey: string,
  windowMs: number,
): Promise<{ count: number; ttlMs: number }> {
  let reply: unknown;
  try {
    reply = await redis.evalsha(RATE_LIMIT_SCRIPT_SHA, 1, redisKey, windowMs);
  } catch (error) {
    if (!isNoScriptError(error)) {
      throw error;
    }
    // Script cache is empty (first use, Redis restart, SCRIPT FLUSH, failover).
    // EVAL runs the script and re-populates the cache for later EVALSHA calls.
    reply = await redis.eval(RATE_LIMIT_SCRIPT, 1, redisKey, windowMs);
  }

  if (
    !Array.isArray(reply) ||
    reply.length < 2 ||
    typeof reply[0] !== "number" ||
    typeof reply[1] !== "number"
  ) {
    throw new Error("Unexpected rate-limit script reply");
  }
  return { count: reply[0], ttlMs: reply[1] };
}

async function consumeRedis(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const redis = injectedRedis ?? getRedisClient();
  if (!redis) {
    return consumeInMemory(key, limit, windowMs);
  }

  const { count, ttlMs } = await runRateLimitScript(
    redis,
    `tore:rl:${key}`,
    windowMs,
  );

  if (count > limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((ttlMs > 0 ? ttlMs : windowMs) / 1000),
      ),
    };
  }

  return { ok: true };
}

function shouldUseRedis(): boolean {
  if (injectedRedis) return true;
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

/** OTP verification attempts: 5 / 15 minutes / IP+email */
export const VERIFY_EMAIL_OTP_RATE_LIMIT = {
  limit: 5,
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

/** Admin force-logout: 30 / 15 minutes / admin user */
export const ADMIN_FORCE_LOGOUT_RATE_LIMIT = {
  limit: 30,
  windowMs: 15 * 60 * 1000,
};

/** Admin lawyer account suspend/reinstate: 60 / 15 minutes / admin user */
export const ADMIN_LAWYER_ACCOUNT_RATE_LIMIT = {
  limit: 60,
  windowMs: 15 * 60 * 1000,
};

/** Admin user deactivate/reactivate/role-change: 30 / 15 minutes / admin user */
export const ADMIN_USER_MANAGEMENT_RATE_LIMIT = {
  limit: 30,
  windowMs: 15 * 60 * 1000,
};

/** Notification mark-read: 60 / 15 minutes / user */
export const NOTIFICATION_WRITE_RATE_LIMIT = {
  limit: 60,
  windowMs: 15 * 60 * 1000,
};

/** Admin manual-payment verify/reject: 30 / 15 minutes / admin user */
export const ADMIN_PAYMENT_VERIFICATION_RATE_LIMIT = {
  limit: 30,
  windowMs: 15 * 60 * 1000,
};

/** User's own "Төлбөр хийсэн" claim + manual checkout creation: 10 / 10 minutes / user — generous for retries, tight against abuse. */
export const MANUAL_PAYMENT_CLAIM_RATE_LIMIT = {
  limit: 10,
  windowMs: 10 * 60 * 1000,
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

/**
 * TORE Student case-study grading is unauthenticated (no login wall on the
 * learning track) and each submission can trigger a real AI call, so it is
 * rate-limited per IP like other public actions — 8 graded submissions is
 * generous for genuine studying but bounds the AI cost of abuse/scripting.
 */
export const STUDENT_PROBLEM_EVALUATION_RATE_LIMIT = {
  limit: 8,
  windowMs: 15 * 60 * 1000,
};

/**
 * Written-exam submissions (AI Fact/Element Mapper + AI Legal Tutor) are
 * two AI calls each, unauthenticated, same abuse profile as the legacy
 * student-problem grader above — same budget.
 */
export const WRITTEN_EXAM_SUBMIT_RATE_LIMIT = {
  limit: 8,
  windowMs: 15 * 60 * 1000,
};

/** Hint requests make no AI call (deterministic) but still bound scripted enumeration of every hint. */
export const WRITTEN_EXAM_HINT_RATE_LIMIT = {
  limit: 20,
  windowMs: 15 * 60 * 1000,
};
