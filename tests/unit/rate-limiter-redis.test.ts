import { createHash } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import {
  consumeRateLimit,
  setRateLimitRedisForTesting,
  type RateLimitRedis,
} from "@/infrastructure/security/rate-limiter";

/**
 * In-memory stand-in for the two Redis commands the limiter uses. It mirrors
 * the real script semantics (INCR, PTTL, conditional PEXPIRE, {count, ttl}
 * reply) and the real script-cache behavior (EVALSHA fails with NOSCRIPT
 * until EVAL has loaded the script). No network is ever opened.
 */
class FakeRedis implements RateLimitRedis {
  now = 1_000_000;
  readonly entries = new Map<string, { count: number; expiresAt: number | null }>();
  readonly scriptCache = new Set<string>();
  readonly calls: Array<{ command: "evalsha" | "eval"; args: unknown[] }> = [];
  nextError: Error | null = null;
  replyOverride: unknown;

  flushScripts(): void {
    this.scriptCache.clear();
  }

  seedWithoutTtl(key: string, count: number): void {
    this.entries.set(key, { count, expiresAt: null });
  }

  ttlOf(key: string): number {
    const entry = this.entries.get(key);
    if (!entry) return -2;
    return entry.expiresAt === null ? -1 : entry.expiresAt - this.now;
  }

  private execute(key: string, windowMs: number): [number, number] {
    const existing = this.entries.get(key);
    if (existing && existing.expiresAt !== null && existing.expiresAt <= this.now) {
      this.entries.delete(key);
    }
    const entry = this.entries.get(key) ?? { count: 0, expiresAt: null };
    entry.count += 1;
    this.entries.set(key, entry);
    let ttl = entry.expiresAt === null ? -1 : entry.expiresAt - this.now;
    if (entry.count === 1 || ttl === -1) {
      entry.expiresAt = this.now + Number(windowMs);
      ttl = Number(windowMs);
    }
    return [entry.count, ttl];
  }

  private preflight(): void {
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = null;
      throw error;
    }
  }

  async evalsha(sha: string, numKeys: number, ...args: Array<string | number>) {
    this.calls.push({ command: "evalsha", args: [sha, numKeys, ...args] });
    this.preflight();
    if (!this.scriptCache.has(sha)) {
      throw new Error("NOSCRIPT No matching script. Please use EVAL.");
    }
    if (this.replyOverride !== undefined) return this.replyOverride;
    return this.execute(String(args[0]), Number(args[1]));
  }

  async eval(script: string, numKeys: number, ...args: Array<string | number>) {
    this.calls.push({ command: "eval", args: [script, numKeys, ...args] });
    this.preflight();
    this.scriptCache.add(createHash("sha1").update(script).digest("hex"));
    if (this.replyOverride !== undefined) return this.replyOverride;
    return this.execute(String(args[0]), Number(args[1]));
  }
}

function useFake(): FakeRedis {
  const fake = new FakeRedis();
  setRateLimitRedisForTesting(fake);
  return fake;
}

afterEach(() => {
  setRateLimitRedisForTesting(undefined);
});

describe("consumeRateLimit — atomic Redis script", () => {
  it("allows up to the limit, then blocks with a TTL-derived retry-after", async () => {
    const fake = useFake();
    expect(await consumeRateLimit("k", 2, 60_000)).toEqual({ ok: true });
    expect(await consumeRateLimit("k", 2, 60_000)).toEqual({ ok: true });

    fake.now += 15_000;
    const blocked = await consumeRateLimit("k", 2, 60_000);
    expect(blocked).toEqual({ ok: false, retryAfterSeconds: 45 });
  });

  it("uses the unchanged key prefix and passes the window through", async () => {
    const fake = useFake();
    await consumeRateLimit("ai-chat:user-1", 5, 900_000);

    const call = fake.calls.at(-1)!;
    expect(call.args[1]).toBe(1);
    expect(call.args[2]).toBe("tore:rl:ai-chat:user-1");
    expect(call.args[3]).toBe(900_000);
  });

  it("sets the TTL on the first hit only and never extends it afterwards", async () => {
    const fake = useFake();
    await consumeRateLimit("k", 10, 60_000);
    expect(fake.ttlOf("tore:rl:k")).toBe(60_000);

    fake.now += 20_000;
    await consumeRateLimit("k", 10, 60_000);
    expect(fake.ttlOf("tore:rl:k")).toBe(40_000);
  });

  it("resets after the window expires", async () => {
    const fake = useFake();
    expect(await consumeRateLimit("k", 1, 1_000)).toEqual({ ok: true });
    expect((await consumeRateLimit("k", 1, 1_000)).ok).toBe(false);

    fake.now += 1_001;
    expect(await consumeRateLimit("k", 1, 1_000)).toEqual({ ok: true });
  });

  it("repairs a counter that has no TTL instead of blocking it forever", async () => {
    const fake = useFake();
    // Left behind by an interrupted INCR-then-PEXPIRE: over the limit, no TTL.
    fake.seedWithoutTtl("tore:rl:stuck", 7);
    expect(fake.ttlOf("tore:rl:stuck")).toBe(-1);

    const blocked = await consumeRateLimit("stuck", 5, 60_000);
    expect(blocked).toEqual({ ok: false, retryAfterSeconds: 60 });
    expect(fake.ttlOf("tore:rl:stuck")).toBe(60_000);

    fake.now += 60_001;
    expect(await consumeRateLimit("stuck", 5, 60_000)).toEqual({ ok: true });
  });

  it("does not re-arm the TTL of a healthy key that already has one", async () => {
    const fake = useFake();
    await consumeRateLimit("k", 5, 60_000);
    fake.now += 30_000;
    await consumeRateLimit("k", 5, 60_000);
    expect(fake.ttlOf("tore:rl:k")).toBe(30_000);
  });
});

describe("consumeRateLimit — NOSCRIPT recovery", () => {
  it("falls back to EVAL on a cold script cache, then uses EVALSHA", async () => {
    const fake = useFake();

    expect(await consumeRateLimit("k", 5, 60_000)).toEqual({ ok: true });
    expect(fake.calls.map((c) => c.command)).toEqual(["evalsha", "eval"]);

    await consumeRateLimit("k", 5, 60_000);
    expect(fake.calls.map((c) => c.command)).toEqual([
      "evalsha",
      "eval",
      "evalsha",
    ]);
  });

  it("recovers after SCRIPT FLUSH / failover without losing the count", async () => {
    const fake = useFake();
    await consumeRateLimit("k", 2, 60_000);
    await consumeRateLimit("k", 2, 60_000);

    fake.flushScripts();
    const blocked = await consumeRateLimit("k", 2, 60_000);
    expect(blocked.ok).toBe(false);
    expect(fake.entries.get("tore:rl:k")?.count).toBe(3);
  });

  it("sends EVALSHA with the digest of the exact script it later EVALs", async () => {
    const fake = useFake();
    await consumeRateLimit("k", 5, 60_000);

    const sha = fake.calls[0]!.args[0] as string;
    const script = fake.calls[1]!.args[0] as string;
    expect(sha).toBe(createHash("sha1").update(script).digest("hex"));
    expect(script).toContain("INCR");
    expect(script).toContain("PTTL");
    expect(script).toContain("PEXPIRE");
    // The TTL-repair condition the fake above mirrors (the Lua itself is not
    // executed in unit tests — no Redis connection is made).
    expect(script).toContain("count == 1 or ttl == -1");
  });
});

describe("consumeRateLimit — Redis errors keep throwing", () => {
  it("propagates a non-NOSCRIPT command error to the caller", async () => {
    const fake = useFake();
    fake.nextError = new Error("Command timed out");

    await expect(consumeRateLimit("k", 5, 60_000)).rejects.toThrow(
      "Command timed out",
    );
  });

  it("propagates an error raised by the EVAL fallback itself", async () => {
    setRateLimitRedisForTesting({
      evalsha: async () => {
        throw new Error("NOSCRIPT No matching script. Please use EVAL.");
      },
      eval: async () => {
        throw new Error("READONLY You can't write against a read only replica.");
      },
    });

    await expect(consumeRateLimit("k", 5, 60_000)).rejects.toThrow("READONLY");
  });

  it("throws on a malformed script reply instead of admitting the request", async () => {
    const fake = useFake();
    fake.flushScripts();
    fake.replyOverride = "OK";

    await expect(consumeRateLimit("k", 5, 60_000)).rejects.toThrow(
      "Unexpected rate-limit script reply",
    );
  });
});

describe("setRateLimitRedisForTesting", () => {
  it("is refused in production", () => {
    const original = process.env.NODE_ENV;
    try {
      Object.assign(process.env, { NODE_ENV: "production" });
      expect(() => setRateLimitRedisForTesting(new FakeRedis())).toThrow(
        "not available in production",
      );
    } finally {
      Object.assign(process.env, { NODE_ENV: original });
    }
  });
});
