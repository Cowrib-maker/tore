import { describe, expect, it, vi } from "vitest";

import { consumeRateLimit } from "@/infrastructure/security/rate-limiter";

describe("consumeRateLimit", () => {
  it("allows requests under the limit and blocks after", async () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    expect(await consumeRateLimit(key, 2, 60_000)).toEqual({ ok: true });
    expect(await consumeRateLimit(key, 2, 60_000)).toEqual({ ok: true });
    const blocked = await consumeRateLimit(key, 2, 60_000);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("resets after the window expires", async () => {
    vi.useFakeTimers();
    const key = `window-${Date.now()}-${Math.random()}`;
    const windowMs = 1_000;

    expect(await consumeRateLimit(key, 1, windowMs)).toEqual({ ok: true });
    expect((await consumeRateLimit(key, 1, windowMs)).ok).toBe(false);

    vi.advanceTimersByTime(windowMs + 1);
    expect(await consumeRateLimit(key, 1, windowMs)).toEqual({ ok: true });

    vi.useRealTimers();
  });

  it("stays on in-memory path under NODE_ENV=test", async () => {
    expect(process.env.NODE_ENV).toBe("test");
    const key = `test-backend-${Date.now()}-${Math.random()}`;
    // Distinct keys prove isolate buckets (Redis would share a process-wide keyspace).
    expect(await consumeRateLimit(key, 1, 60_000)).toEqual({ ok: true });
    expect((await consumeRateLimit(key, 1, 60_000)).ok).toBe(false);
  });
});
