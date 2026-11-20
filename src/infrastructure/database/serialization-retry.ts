import { Prisma } from "@/generated/prisma/client";
import { SpellActiveActivationConflictError } from "@/domain/repositories/spell-activation-repository";

const RETRYABLE_PG_CODES = new Set(["40001", "40P01"]);

type MaybeDriverError = {
  code?: unknown;
  cause?: { code?: unknown; kind?: unknown; originalCode?: unknown } | null;
};

/**
 * Errors that mean "another transaction won; re-run me on fresh state":
 *  - DriverAdapterError{cause.kind:"TransactionWriteConflict", originalCode:"40001"}:
 *    what Prisma 7 + @prisma/adapter-pg ACTUALLY throws for a Postgres
 *    serialization failure (verified against a real database in
 *    tests/db/spell.db.test.ts — it is NOT a PrismaClientKnownRequestError).
 *  - P2034: Prisma's write-conflict code on other engines/adapters
 *  - P2039: the transaction could not START (pool starvation under burst);
 *    nothing ran, so re-running is trivially safe
 *  - raw 40001 / 40P01 (serialization failure / deadlock) however nested
 *  - the one-ACTIVE-per-licence partial unique index losing a race
 */
export function isRetryableSerializationFailure(error: unknown): boolean {
  if (error instanceof SpellActiveActivationConflictError) return true;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" || error.code === "P2039")
  ) {
    return true;
  }
  const e = error as MaybeDriverError | null;
  if (!e || typeof e !== "object") return false;
  if (e.cause?.kind === "TransactionWriteConflict") return true;
  for (const candidate of [e.code, e.cause?.code, e.cause?.originalCode]) {
    if (typeof candidate === "string" && RETRYABLE_PG_CODES.has(candidate)) {
      return true;
    }
  }
  return false;
}

export type RetryOptions = {
  maxAttempts: number;
  baseDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

export const DEFAULT_SERIALIZATION_RETRY: RetryOptions = {
  maxAttempts: 5,
  baseDelayMs: 15,
};

/**
 * Bounded retry with jittered exponential backoff. Re-throws the last error
 * once attempts are exhausted — it never swallows a failure, and never
 * retries errors that are not serialization conflicts.
 */
export async function withSerializationRetry<T>(
  work: (attempt: number) => Promise<T>,
  options: RetryOptions = DEFAULT_SERIALIZATION_RETRY,
  isRetryable: (error: unknown) => boolean = isRetryableSerializationFailure,
): Promise<T> {
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = options.random ?? Math.random;
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await work(attempt);
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === options.maxAttempts) {
        throw error;
      }
      const backoff = options.baseDelayMs * 2 ** (attempt - 1);
      await sleep(Math.round(backoff * (0.5 + random() * 0.5)));
    }
  }
  throw lastError;
}
