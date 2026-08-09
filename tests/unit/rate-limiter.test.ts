import { describe, expect, it } from "vitest";

import {
  consumeRateLimit,
} from "@/infrastructure/security/rate-limiter";

describe("consumeRateLimit", () => {
  it("allows requests under the limit and blocks after", () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    expect(consumeRateLimit(key, 2, 60_000)).toEqual({ ok: true });
    expect(consumeRateLimit(key, 2, 60_000)).toEqual({ ok: true });
    const blocked = consumeRateLimit(key, 2, 60_000);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    }
  });
});
