import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import type { RateLimitResult } from "@/infrastructure/security/rate-limiter";

/**
 * Preview-only verification of the rate limiter's Lua path against the real
 * Redis behind REDIS_URL (TCP). Every key it writes lives under a per-request
 * UUID namespace, and cleanup only ever deletes keys under that namespace.
 *
 * Output contract: fixed step names, fixed status values, fixed error codes,
 * and numeric/boolean details only. Raw Redis error messages, URLs, hosts and
 * tokens are never placed in a report.
 */

export const DIAG_TOKEN_HEADER = "x-tore-diag-token";
export const DIAG_TOKEN_ENV = "TORE_REDIS_DIAG_TOKEN";
export const DIAG_MARKER_PREFIX = "tore:diag:used:";
export const DIAG_MARKER_TTL_SECONDS = 3600;

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const NAMESPACE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WINDOW_MS = 5_000;
const ALLOW_BLOCK_WINDOW_MS = 4_000;
const AFTER_WINDOW_WAIT_MS = 4_300;
const MAX_SCAN_ITERATIONS = 1_000;

export type DiagStatus =
  | "PASS"
  | "FAIL"
  | "SKIPPED_CACHE_WARM"
  | "UNSUPPORTED"
  | "NOT_PROVEN";

export type DiagCode =
  | "REDIS_NOT_CONFIGURED"
  | "REDIS_SCHEME_NOT_TLS"
  | "REDIS_UNAVAILABLE"
  | "REDIS_TIMEOUT"
  | "NOSCRIPT_EXPECTED"
  | "UNEXPECTED_REPLY"
  | "SCRIPT_EXISTS_UNSUPPORTED"
  | "ASSERTION_FAILED"
  | "CLEANUP_FAILED"
  | "INTERNAL";

export type DiagStepName =
  | "connect"
  | "script_exists_supported"
  | "cold_evalsha_noscript"
  | "module_noscript_fallback"
  | "warm_evalsha_reply_shape"
  | "ttl_repair"
  | "allow_then_block"
  | "allowed_after_window"
  | "namespace_keys_have_ttl"
  | "aborted"
  | "cleanup";

export type DiagStep = {
  name: DiagStepName;
  status: DiagStatus;
  code?: DiagCode;
  detail?: Record<string, number | boolean>;
};

export type DiagGate = "PASSED" | "INCONCLUSIVE" | "FAILED";

export type DiagReport = {
  ok: boolean;
  gate: DiagGate;
  code?: DiagCode;
  steps: DiagStep[];
};

/** The Redis commands this diagnostic uses. A real ioredis client satisfies it. */
export type DiagRedis = {
  ping(): Promise<unknown>;
  set(key: string, value: string, ...args: Array<string | number>): Promise<unknown>;
  script(subcommand: string, ...args: string[]): Promise<unknown>;
  evalsha(sha: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
  pttl(key: string): Promise<number>;
  scan(cursor: string, ...args: Array<string | number>): Promise<[string, string[]]>;
  del(...keys: string[]): Promise<unknown>;
};

export type DiagConsume = (
  key: string,
  limit: number,
  windowMs: number,
) => Promise<RateLimitResult>;

/** Runs only on a Vercel Preview deployment. Read at request time. */
export function isDiagnosticsEnvironment(env: Record<string, string | undefined>): boolean {
  return env.VERCEL === "1" && env.VERCEL_ENV === "preview";
}

/** The configured token, or null when it is missing or not 64 lowercase hex characters. */
export function readConfiguredToken(env: Record<string, string | undefined>): string | null {
  const value = env[DIAG_TOKEN_ENV];
  return typeof value === "string" && TOKEN_PATTERN.test(value) ? value : null;
}

/** Exactly 64 lowercase hex characters; length is checked before the pattern. */
export function isWellFormedToken(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length === 64 && TOKEN_PATTERN.test(value);
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function tokensMatch(provided: string, expected: string): boolean {
  return timingSafeEqual(sha256(provided), sha256(expected));
}

export function markerKeyFor(token: string): string {
  return `${DIAG_MARKER_PREFIX}${sha256(token).toString("hex")}`;
}

/** Only the URL scheme (e.g. "rediss:"), never the host or credentials. */
export function redisUrlScheme(url: string): string | null {
  try {
    return new URL(url).protocol;
  } catch {
    return null;
  }
}

export type MarkerResult = "ACQUIRED" | "USED" | "UNAVAILABLE";

/** One-time use: SET NX means exactly one caller can hold the marker. */
export async function acquireDiagnosticsMarker(
  redis: Pick<DiagRedis, "set">,
  token: string,
): Promise<MarkerResult> {
  try {
    const reply = await redis.set(
      markerKeyFor(token),
      "1",
      "EX",
      DIAG_MARKER_TTL_SECONDS,
      "NX",
    );
    return reply === "OK" ? "ACQUIRED" : "USED";
  } catch {
    return "UNAVAILABLE";
  }
}

function isNoScriptError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("NOSCRIPT");
}

/** Maps any thrown value to a fixed code. The message itself is never returned. */
export function classifyRedisError(error: unknown): DiagCode {
  const message = error instanceof Error ? error.message : "";
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  if (/timed out/i.test(message)) return "REDIS_TIMEOUT";
  if (
    ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"].includes(code) ||
    /connection is closed/i.test(message)
  ) {
    return "REDIS_UNAVAILABLE";
  }
  return "INTERNAL";
}

function isIntegerPair(reply: unknown): reply is [number, number] {
  return (
    Array.isArray(reply) &&
    reply.length === 2 &&
    Number.isInteger(reply[0]) &&
    Number.isInteger(reply[1])
  );
}

export function computeGate(steps: readonly DiagStep[]): DiagGate {
  if (steps.some((step) => step.status === "FAIL")) return "FAILED";
  if (steps.some((step) => step.status !== "PASS")) return "INCONCLUSIVE";
  return "PASSED";
}

export async function runRedisRateLimitDiagnostics(deps: {
  redis: DiagRedis;
  consume: DiagConsume;
  scriptSha: string;
  namespaceId?: string;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<DiagReport> {
  const namespaceId = deps.namespaceId ?? randomUUID();
  if (!NAMESPACE_ID_PATTERN.test(namespaceId)) {
    throw new Error("Invalid diagnostics namespace id");
  }
  const { redis, consume, scriptSha } = deps;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;

  const namespace = `diag:${namespaceId}`;
  const keyPrefix = `tore:rl:${namespace}:`;
  const created = new Set<string>();
  const ownKey = (suffix: string) => {
    const key = `${keyPrefix}${suffix}`;
    created.add(key);
    return key;
  };
  const ownName = (suffix: string) => {
    created.add(`${keyPrefix}${suffix}`);
    return `${namespace}:${suffix}`;
  };

  const steps: DiagStep[] = [];
  const record = (step: DiagStep) => {
    steps.push(step);
  };

  async function scriptExists(): Promise<number | "unsupported"> {
    try {
      const reply = await redis.script("EXISTS", scriptSha);
      if (Array.isArray(reply) && (reply[0] === 0 || reply[0] === 1)) {
        return reply[0];
      }
      return "unsupported";
    } catch {
      return "unsupported";
    }
  }

  async function scanOwnKeys(): Promise<string[]> {
    const found = new Set<string>();
    let cursor = "0";
    for (let i = 0; i < MAX_SCAN_ITERATIONS; i += 1) {
      const [next, keys] = await redis.scan(cursor, "MATCH", `${keyPrefix}*`, "COUNT", 100);
      for (const key of keys) found.add(key);
      cursor = String(next);
      if (cursor === "0") break;
    }
    return [...found];
  }

  try {
    const pingStartedAt = now();
    await redis.ping();
    record({ name: "connect", status: "PASS", detail: { latencyMs: now() - pingStartedAt } });

    const cacheAtStart = await scriptExists();
    const existsSupported = cacheAtStart !== "unsupported";
    record(
      existsSupported
        ? { name: "script_exists_supported", status: "PASS", detail: { cachedAtStart: cacheAtStart === 1 } }
        : { name: "script_exists_supported", status: "UNSUPPORTED", code: "SCRIPT_EXISTS_UNSUPPORTED" },
    );

    // Raw cold EVALSHA: the reply itself is the evidence that the script was
    // not cached at that moment.
    let coldObserved = false;
    if (cacheAtStart === 1) {
      record({ name: "cold_evalsha_noscript", status: "SKIPPED_CACHE_WARM" });
    } else {
      try {
        await redis.evalsha(scriptSha, 1, ownKey("cold"), WINDOW_MS);
        // Succeeded, so the script was already cached (loaded by other traffic).
        record({ name: "cold_evalsha_noscript", status: "SKIPPED_CACHE_WARM" });
      } catch (error) {
        if (isNoScriptError(error)) {
          coldObserved = true;
          record({ name: "cold_evalsha_noscript", status: "PASS", detail: { noscriptPrefix: true } });
        } else {
          const code = classifyRedisError(error);
          record({
            name: "cold_evalsha_noscript",
            status: "FAIL",
            code: code === "INTERNAL" ? "NOSCRIPT_EXPECTED" : code,
            detail: { noscriptPrefix: false },
          });
        }
      }
    }

    // Module-level fallback through the real consumeRateLimit. It is only
    // reported as PASS with cold-cache evidence on both sides of the call.
    const existsBefore = existsSupported ? await scriptExists() : "unsupported";
    const fallback = await consume(ownName("fallback"), 5, WINDOW_MS);
    const existsAfter = existsSupported ? await scriptExists() : "unsupported";
    const fallbackProven =
      existsSupported && coldObserved && existsBefore === 0 && existsAfter === 1;
    if (!fallback.ok) {
      record({ name: "module_noscript_fallback", status: "FAIL", code: "ASSERTION_FAILED" });
    } else {
      record({
        name: "module_noscript_fallback",
        status: fallbackProven ? "PASS" : "NOT_PROVEN",
        detail: { allowed: true, coldEvidence: fallbackProven },
      });
    }

    // Warm EVALSHA and reply shape.
    try {
      const reply = await redis.evalsha(scriptSha, 1, ownKey("warm"), WINDOW_MS);
      const shapeOk = isIntegerPair(reply);
      const valuesOk = shapeOk && reply[0] === 1 && reply[1] > 0 && reply[1] <= WINDOW_MS;
      record(
        valuesOk
          ? { name: "warm_evalsha_reply_shape", status: "PASS", detail: { count: reply[0], ttlMs: reply[1] } }
          : {
              name: "warm_evalsha_reply_shape",
              status: "FAIL",
              code: shapeOk ? "ASSERTION_FAILED" : "UNEXPECTED_REPLY",
            },
      );
    } catch (error) {
      const code = classifyRedisError(error);
      record({
        name: "warm_evalsha_reply_shape",
        status: "FAIL",
        code: code === "INTERNAL" ? "ASSERTION_FAILED" : code,
      });
    }

    // TTL repair: a counter over the limit that has no TTL.
    const repairKey = ownKey("repair");
    await redis.set(repairKey, "7");
    const ttlBefore = await redis.pttl(repairKey);
    const repaired = await consume(ownName("repair"), 5, WINDOW_MS);
    const ttlAfter = await redis.pttl(repairKey);
    const repairOk = ttlBefore === -1 && !repaired.ok && ttlAfter > 0 && ttlAfter <= WINDOW_MS;
    record(
      repairOk
        ? { name: "ttl_repair", status: "PASS", detail: { ttlMsAfter: ttlAfter } }
        : { name: "ttl_repair", status: "FAIL", code: "ASSERTION_FAILED" },
    );

    // Allow, then block with retry-after.
    const results: RateLimitResult[] = [];
    for (let i = 0; i < 4; i += 1) {
      results.push(await consume(ownName("ab"), 3, ALLOW_BLOCK_WINDOW_MS));
    }
    const blocked = results[3];
    const allowBlockOk =
      results.slice(0, 3).every((r) => r.ok) &&
      blocked !== undefined &&
      !blocked.ok &&
      blocked.retryAfterSeconds >= 1 &&
      blocked.retryAfterSeconds <= ALLOW_BLOCK_WINDOW_MS / 1000;
    record(
      allowBlockOk && blocked && !blocked.ok
        ? { name: "allow_then_block", status: "PASS", detail: { retryAfterSeconds: blocked.retryAfterSeconds } }
        : { name: "allow_then_block", status: "FAIL", code: "ASSERTION_FAILED" },
    );

    await sleep(AFTER_WINDOW_WAIT_MS);
    const afterWindow = await consume(ownName("ab"), 3, ALLOW_BLOCK_WINDOW_MS);
    record(
      afterWindow.ok
        ? { name: "allowed_after_window", status: "PASS" }
        : { name: "allowed_after_window", status: "FAIL", code: "ASSERTION_FAILED" },
    );

    const keys = await scanOwnKeys();
    const ttls = await Promise.all(keys.map((key) => redis.pttl(key)));
    const allHaveTtl = ttls.every((ttl) => ttl > 0 || ttl === -2);
    record(
      allHaveTtl
        ? { name: "namespace_keys_have_ttl", status: "PASS", detail: { keys: keys.length } }
        : { name: "namespace_keys_have_ttl", status: "FAIL", code: "ASSERTION_FAILED" },
    );
  } catch (error) {
    record({ name: "aborted", status: "FAIL", code: classifyRedisError(error) });
  } finally {
    try {
      let candidates: string[] = [...created];
      try {
        candidates = [...new Set([...candidates, ...(await scanOwnKeys())])];
      } catch {
        // SCAN failed: fall back to the keys this request created itself.
      }
      const own = candidates.filter((key) => key.startsWith(keyPrefix));
      if (own.length > 0) {
        await redis.del(...own);
      }
      record({ name: "cleanup", status: "PASS", detail: { deleted: own.length } });
    } catch {
      record({ name: "cleanup", status: "FAIL", code: "CLEANUP_FAILED" });
    }
  }

  const gate = computeGate(steps);
  return { ok: gate === "PASSED", gate, steps };
}
