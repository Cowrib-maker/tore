import Redis, { type RedisOptions } from "ioredis";

let client: Redis | null = null;

/** Fail a connection attempt instead of hanging on an unreachable host. */
export const REDIS_CONNECT_TIMEOUT_MS = 2_000;
/**
 * Fail a single command instead of waiting indefinitely on a stalled link.
 * ioredis starts this timer when the command is issued, so it also covers
 * time spent in the offline queue while the first connection is established;
 * it must therefore comfortably exceed REDIS_CONNECT_TIMEOUT_MS.
 */
export const REDIS_COMMAND_TIMEOUT_MS = 5_000;
/** Unchanged from the previous client configuration; kept explicitly bounded. */
export const REDIS_MAX_RETRIES_PER_REQUEST = 3;
/** Minimum gap between logged Redis connection errors (log-spam guard). */
export const REDIS_ERROR_LOG_INTERVAL_MS = 30_000;

export function buildRedisOptions(): RedisOptions {
  return {
    maxRetriesPerRequest: REDIS_MAX_RETRIES_PER_REQUEST,
    enableReadyCheck: true,
    lazyConnect: false,
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
  };
}

/**
 * ioredis emits connection failures as "error" events. With no listener,
 * Node treats an emitted "error" as unhandled and ioredis only prints a
 * noisy "[ioredis] Unhandled error event" line. This listener swallows the
 * event (command callers still see their own rejection) and logs at most
 * once per interval, with only the error code or name — never the message,
 * which can embed the connection URL.
 */
export function attachRedisErrorListener(
  emitter: { on(event: "error", listener: (error: unknown) => void): unknown },
  log: (message: string) => void = (message) => console.error(message),
  now: () => number = Date.now,
): void {
  let lastLoggedAt: number | null = null;
  emitter.on("error", (error: unknown) => {
    const at = now();
    if (lastLoggedAt !== null && at - lastLoggedAt < REDIS_ERROR_LOG_INTERVAL_MS) {
      return;
    }
    lastLoggedAt = at;
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : error instanceof Error
          ? error.name
          : "unknown";
    log(`Redis client error (${code}).`);
  });
}

/**
 * Shared Redis client for production rate limiting (REDIS_URL).
 * Returns null when Redis is not configured (dev/test in-memory fallback).
 */
export function getRedisClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (!client) {
    client = new Redis(url, buildRedisOptions());
    attachRedisErrorListener(client);
  }

  return client;
}
