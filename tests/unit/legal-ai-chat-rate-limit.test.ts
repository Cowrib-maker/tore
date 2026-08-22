import { describe, expect, it } from "vitest";

import { rateLimitHttpResponse } from "@/application/common/rate-limit-http";
import {
  consumeRateLimit,
  LEGAL_AI_CHAT_RATE_LIMIT,
  legalAiChatRateLimitKey,
} from "@/infrastructure/security/rate-limiter";

describe("legal AI chat rate limit", () => {
  it("uses a userId bucket and never email or API keys", () => {
    expect(LEGAL_AI_CHAT_RATE_LIMIT).toEqual({
      limit: 30,
      windowMs: 15 * 60 * 1000,
    });
    expect(legalAiChatRateLimitKey("user-123")).toBe("ai-chat:user-123");
    expect(legalAiChatRateLimitKey("user-123")).not.toMatch(/@|sk-|QPAY|OPENAI/i);
  });

  it("allows 30 requests then blocks with retry-after", async () => {
    const key = legalAiChatRateLimitKey(`rate-${Date.now()}-${Math.random()}`);
    for (let i = 0; i < LEGAL_AI_CHAT_RATE_LIMIT.limit; i += 1) {
      expect(
        await consumeRateLimit(
          key,
          LEGAL_AI_CHAT_RATE_LIMIT.limit,
          LEGAL_AI_CHAT_RATE_LIMIT.windowMs,
        ),
      ).toEqual({ ok: true });
    }
    const blocked = await consumeRateLimit(
      key,
      LEGAL_AI_CHAT_RATE_LIMIT.limit,
      LEGAL_AI_CHAT_RATE_LIMIT.windowMs,
    );
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("returns HTTP 429 JSON with Retry-After and RATE_LIMITED", async () => {
    const response = rateLimitHttpResponse(42);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    await expect(response.json()).resolves.toEqual({
      error: "Too many requests. Try again in 42 seconds.",
      code: "RATE_LIMITED",
    });
  });
});
