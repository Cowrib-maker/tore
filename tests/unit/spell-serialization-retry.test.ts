import { Prisma } from "@/generated/prisma/client";
import { describe, expect, it } from "vitest";

import { SpellActiveActivationConflictError } from "@/domain/repositories/spell-activation-repository";
import {
  isRetryableSerializationFailure,
  withSerializationRetry,
} from "@/infrastructure/database/serialization-retry";

const p2034 = () =>
  new Prisma.PrismaClientKnownRequestError("write conflict", { code: "P2034", clientVersion: "x" });

const fast = { maxAttempts: 4, baseDelayMs: 10, sleep: async () => undefined, random: () => 0.5 };

describe("serialization retry", () => {
  it("classifies serialization failures, deadlocks and the one-active index as retryable", () => {
    expect(isRetryableSerializationFailure(p2034())).toBe(true);
    expect(isRetryableSerializationFailure(new SpellActiveActivationConflictError())).toBe(true);
    expect(
      isRetryableSerializationFailure(
        new Prisma.PrismaClientKnownRequestError("could not start", { code: "P2039", clientVersion: "x" }),
      ),
    ).toBe(true);
    expect(isRetryableSerializationFailure({ code: "40001" })).toBe(true);
    expect(isRetryableSerializationFailure({ cause: { code: "40P01" } })).toBe(true);
    expect(isRetryableSerializationFailure(new Error("boom"))).toBe(false);
    expect(isRetryableSerializationFailure({ code: "23505" })).toBe(false);
    expect(isRetryableSerializationFailure(null)).toBe(false);
    // The real Prisma 7 + adapter-pg shape, captured from a live Postgres 40001.
    const driver = Object.assign(new Error("TransactionWriteConflict"), {
      name: "DriverAdapterError",
      cause: { kind: "TransactionWriteConflict", originalCode: "40001" },
    });
    expect(isRetryableSerializationFailure(driver)).toBe(true);
    expect(isRetryableSerializationFailure({ cause: { originalCode: "40P01" } })).toBe(true);
    expect(isRetryableSerializationFailure({ cause: { kind: "UniqueConstraintViolation", originalCode: "23505" } })).toBe(false);
  });

  it("retries until success, with exponential backoff", async () => {
    const delays: number[] = [];
    let calls = 0;
    const result = await withSerializationRetry(
      async (attempt) => {
        calls++;
        if (attempt < 3) throw p2034();
        return "ok";
      },
      { ...fast, sleep: async (ms) => { delays.push(ms); } },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(delays).toEqual([8, 15]); // 10*0.75, 20*0.75 (rounded)
  });

  it("is bounded: gives up after maxAttempts and rethrows the last error", async () => {
    let calls = 0;
    const error = p2034();
    await expect(
      withSerializationRetry(async () => { calls++; throw error; }, fast),
    ).rejects.toBe(error);
    expect(calls).toBe(4);
  });

  it("never retries non-serialization errors", async () => {
    let calls = 0;
    await expect(
      withSerializationRetry(async () => { calls++; throw new Error("validation"); }, fast),
    ).rejects.toThrow("validation");
    expect(calls).toBe(1);
  });
});
