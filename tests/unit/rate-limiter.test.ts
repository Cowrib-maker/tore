import { describe, expect, it } from "vitest";

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
});
