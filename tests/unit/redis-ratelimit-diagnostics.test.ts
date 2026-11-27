import { createHash } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import {
  consumeRateLimit,
  RATE_LIMIT_SCRIPT_SHA,
  setRateLimitRedisForTesting,
} from "@/infrastructure/security/rate-limiter";
import {
  acquireDiagnosticsMarker,
  classifyRedisError,
  computeGate,
  DIAG_MARKER_PREFIX,
  DIAG_TOKEN_ENV,
  isDiagnosticsEnvironment,
  isWellFormedToken,
  markerKeyFor,
  readConfiguredToken,
  redisUrlScheme,
  runRedisRateLimitDiagnostics,
  tokensMatch,
  type DiagReport,
} from "@/infrastructure/security/redis-ratelimit-diagnostics";

const NS = "0f1e2d3c-4b5a-4968-8776-655443322110";
const OTHER_NS = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const SECRETISH_MESSAGE = "boom rediss://default:hunter2-secret@db.example-host.io:6379";
const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

/**
 * In-memory Redis stand-in with the script semantics of the production Lua
 * (INCR, PTTL, conditional PEXPIRE) and a real script cache. No network.
 */
class FakeRedis {
  now = 1_000_000;
  readonly store = new Map<string, { value: string; expiresAt: number | null }>();
  readonly scripts = new Set<string>();
  readonly commands: string[] = [];
  scriptExistsUnsupported = false;
  evalshaError: Error | null = null;
  pttlFailAfter: number | null = null;
  delFails = false;
  private pttlCalls = 0;

  private live(key: string) {
    const entry = this.store.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= this.now) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  private runScript(key: string, windowMs: number): [number, number] {
    const entry = this.live(key) ?? { value: "0", expiresAt: null };
    const count = Number(entry.value) + 1;
    entry.value = String(count);
    this.store.set(key, entry);
    let ttl = entry.expiresAt === null ? -1 : entry.expiresAt - this.now;
    if (count === 1 || ttl === -1) {
      entry.expiresAt = this.now + windowMs;
      ttl = windowMs;
    }
    return [count, ttl];
  }

  async ping() {
    this.commands.push("PING");
    return "PONG";
  }

  async set(key: string, value: string, ...args: Array<string | number>) {
    this.commands.push("SET");
    const upper = args.map((a) => String(a).toUpperCase());
    if (upper.includes("NX") && this.live(key)) return null;
    const exIndex = upper.indexOf("EX");
    const expiresAt = exIndex >= 0 ? this.now + Number(args[exIndex + 1]) * 1000 : null;
    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  async script(subcommand: string, ...shas: string[]) {
    this.commands.push(`SCRIPT ${subcommand}`);
    if (this.scriptExistsUnsupported) throw new Error(`ERR unknown subcommand ${SECRETISH_MESSAGE}`);
    if (subcommand.toUpperCase() !== "EXISTS") throw new Error("ERR unsupported in fake");
    return shas.map((sha) => (this.scripts.has(sha) ? 1 : 0));
  }

  async evalsha(sha: string, _numKeys: number, ...args: Array<string | number>) {
    this.commands.push("EVALSHA");
    if (this.evalshaError) throw this.evalshaError;
    if (!this.scripts.has(sha)) throw new Error("NOSCRIPT No matching script. Please use EVAL.");
    return this.runScript(String(args[0]), Number(args[1]));
  }

  async eval(script: string, _numKeys: number, ...args: Array<string | number>) {
    this.commands.push("EVAL");
    this.scripts.add(sha1(script));
    return this.runScript(String(args[0]), Number(args[1]));
  }

  async pttl(key: string) {
    this.commands.push("PTTL");
    this.pttlCalls += 1;
    if (this.pttlFailAfter !== null && this.pttlCalls > this.pttlFailAfter) {
      throw new Error(SECRETISH_MESSAGE);
    }
    const entry = this.live(key);
    if (!entry) return -2;
    return entry.expiresAt === null ? -1 : entry.expiresAt - this.now;
  }

  async scan(_cursor: string, ...args: Array<string | number>) {
    this.commands.push("SCAN");
    const pattern = String(args[args.indexOf("MATCH") + 1]);
    const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
    const keys = [...this.store.keys()].filter((k) => this.live(k) && k.startsWith(prefix));
    return ["0", keys] as [string, string[]];
  }

  async del(...keys: string[]) {
    this.commands.push("DEL");
    if (this.delFails) throw new Error(SECRETISH_MESSAGE);
    let removed = 0;
    for (const key of keys) if (this.store.delete(key)) removed += 1;
    return removed;
  }
}

function setup() {
  const fake = new FakeRedis();
  setRateLimitRedisForTesting(fake);
  const run = () =>
    runRedisRateLimitDiagnostics({
      redis: fake,
      consume: consumeRateLimit,
      scriptSha: RATE_LIMIT_SCRIPT_SHA,
      namespaceId: NS,
      sleep: async (ms) => {
        fake.now += ms;
      },
      now: () => fake.now,
    });
  return { fake, run };
}

const statusOf = (report: DiagReport, name: string) =>
  report.steps.find((step) => step.name === name)?.status;

afterEach(() => {
  setRateLimitRedisForTesting(undefined);
});

describe("runRedisRateLimitDiagnostics — cold cache", () => {
  it("passes every step and the gate on a fresh script cache", async () => {
    const { run } = setup();
    const report = await run();

    expect(report.gate).toBe("PASSED");
    expect(report.ok).toBe(true);
    expect(report.steps.map((s) => [s.name, s.status])).toEqual([
      ["connect", "PASS"],
      ["script_exists_supported", "PASS"],
      ["cold_evalsha_noscript", "PASS"],
      ["module_noscript_fallback", "PASS"],
      ["warm_evalsha_reply_shape", "PASS"],
      ["ttl_repair", "PASS"],
      ["allow_then_block", "PASS"],
      ["allowed_after_window", "PASS"],
      ["namespace_keys_have_ttl", "PASS"],
      ["cleanup", "PASS"],
    ]);
  });

  it("goes through EVALSHA -> NOSCRIPT -> EVAL for the module call", async () => {
    const { fake, run } = setup();
    await run();
    const firstEval = fake.commands.indexOf("EVAL");
    expect(firstEval).toBeGreaterThan(0);
    expect(fake.commands[firstEval - 1]).toBe("EVALSHA");
    expect(fake.commands.filter((c) => c === "EVAL")).toHaveLength(1);
  });

  it("reports retry-after and TTL repair details as numbers only", async () => {
    const { run } = setup();
    const report = await run();
    const allowBlock = report.steps.find((s) => s.name === "allow_then_block");
    expect(allowBlock?.detail?.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(allowBlock?.detail?.retryAfterSeconds).toBeLessThanOrEqual(4);
    for (const step of report.steps) {
      for (const value of Object.values(step.detail ?? {})) {
        expect(["number", "boolean"]).toContain(typeof value);
      }
    }
  });
});

describe("runRedisRateLimitDiagnostics — missing cold-cache evidence", () => {
  it("marks cold steps SKIPPED_CACHE_WARM and fallback NOT_PROVEN on a warm cache", async () => {
    const { fake, run } = setup();
    fake.scripts.add(RATE_LIMIT_SCRIPT_SHA);
    const report = await run();

    expect(statusOf(report, "cold_evalsha_noscript")).toBe("SKIPPED_CACHE_WARM");
    expect(statusOf(report, "module_noscript_fallback")).toBe("NOT_PROVEN");
    expect(report.gate).toBe("INCONCLUSIVE");
    expect(report.ok).toBe(false);
  });

  it("marks SCRIPT EXISTS UNSUPPORTED and never confirms the fallback", async () => {
    const { fake, run } = setup();
    fake.scriptExistsUnsupported = true;
    const report = await run();

    const exists = report.steps.find((s) => s.name === "script_exists_supported");
    expect(exists?.status).toBe("UNSUPPORTED");
    expect(exists?.code).toBe("SCRIPT_EXISTS_UNSUPPORTED");
    // The raw NOSCRIPT reply is still observed...
    expect(statusOf(report, "cold_evalsha_noscript")).toBe("PASS");
    // ...but without SCRIPT EXISTS evidence the module fallback is not confirmed.
    expect(statusOf(report, "module_noscript_fallback")).toBe("NOT_PROVEN");
    expect(report.gate).toBe("INCONCLUSIVE");
  });
});

describe("runRedisRateLimitDiagnostics — failures use fixed codes only", () => {
  it("fails with NOSCRIPT_EXPECTED when cold EVALSHA returns a different error", async () => {
    const { fake, run } = setup();
    fake.evalshaError = new Error(`ERR something else ${SECRETISH_MESSAGE}`);
    const report = await run();

    const cold = report.steps.find((s) => s.name === "cold_evalsha_noscript");
    expect(cold?.status).toBe("FAIL");
    expect(cold?.code).toBe("NOSCRIPT_EXPECTED");
    expect(report.gate).toBe("FAILED");
  });

  it("never includes raw messages, URLs, hosts or credentials in the report", async () => {
    const { fake, run } = setup();
    fake.evalshaError = new Error(SECRETISH_MESSAGE);
    fake.scriptExistsUnsupported = true;
    const body = JSON.stringify(await run());

    expect(body).not.toContain("hunter2");
    expect(body).not.toContain("example-host");
    expect(body).not.toContain("rediss://");
    expect(body).not.toContain("boom");
    expect(body).not.toMatch(/at \w+ \(/); // no stack frames
  });
});

describe("runRedisRateLimitDiagnostics — cleanup isolation", () => {
  it("deletes only its own namespace, even when a step throws", async () => {
    const { fake, run } = setup();
    await fake.set(`tore:rl:diag:${OTHER_NS}:ab`, "2", "EX", 60);
    await fake.set("tore:rl:ai-chat:user-1", "4", "EX", 60);
    await fake.set(`${DIAG_MARKER_PREFIX}${"a".repeat(64)}`, "1", "EX", 3600);
    fake.pttlFailAfter = 1; // the TTL repair step throws mid-run

    const report = await run();

    expect(statusOf(report, "aborted")).toBe("FAIL");
    expect(statusOf(report, "cleanup")).toBe("PASS");
    const remaining = [...fake.store.keys()];
    expect(remaining.some((k) => k.includes(NS))).toBe(false);
    expect(remaining).toContain(`tore:rl:diag:${OTHER_NS}:ab`);
    expect(remaining).toContain("tore:rl:ai-chat:user-1");
    expect(remaining).toContain(`${DIAG_MARKER_PREFIX}${"a".repeat(64)}`);
  });

  it("reports CLEANUP_FAILED when deletion fails", async () => {
    const { fake, run } = setup();
    fake.delFails = true;
    const report = await run();
    const cleanup = report.steps.find((s) => s.name === "cleanup");
    expect(cleanup?.status).toBe("FAIL");
    expect(cleanup?.code).toBe("CLEANUP_FAILED");
    expect(report.gate).toBe("FAILED");
  });

  it("rejects a namespace id that is not a UUID", async () => {
    const fake = new FakeRedis();
    await expect(
      runRedisRateLimitDiagnostics({
        redis: fake,
        consume: consumeRateLimit,
        scriptSha: RATE_LIMIT_SCRIPT_SHA,
        namespaceId: "*",
      }),
    ).rejects.toThrow("Invalid diagnostics namespace id");
    expect(fake.commands).toEqual([]);
  });
});

describe("one-time marker", () => {
  const token = "c".repeat(64);

  it("uses the full 64-character SHA-256 digest in the key", () => {
    const digest = createHash("sha256").update(token).digest("hex");
    expect(markerKeyFor(token)).toBe(`${DIAG_MARKER_PREFIX}${digest}`);
    expect(markerKeyFor(token).slice(DIAG_MARKER_PREFIX.length)).toHaveLength(64);
    expect(markerKeyFor(token)).not.toContain(token);
  });

  it("is acquired once, then reported as used", async () => {
    const fake = new FakeRedis();
    expect(await acquireDiagnosticsMarker(fake, token)).toBe("ACQUIRED");
    expect(await acquireDiagnosticsMarker(fake, token)).toBe("USED");
  });

  it("lets exactly one of two concurrent callers acquire it", async () => {
    const fake = new FakeRedis();
    const results = await Promise.all([
      acquireDiagnosticsMarker(fake, token),
      acquireDiagnosticsMarker(fake, token),
    ]);
    expect(results.filter((r) => r === "ACQUIRED")).toHaveLength(1);
    expect(results.filter((r) => r === "USED")).toHaveLength(1);
  });

  it("returns UNAVAILABLE when Redis fails", async () => {
    const result = await acquireDiagnosticsMarker(
      { set: async () => { throw new Error(SECRETISH_MESSAGE); } },
      token,
    );
    expect(result).toBe("UNAVAILABLE");
  });
});

describe("guards and helpers", () => {
  it("runs only on Vercel Preview", () => {
    expect(isDiagnosticsEnvironment({ VERCEL: "1", VERCEL_ENV: "preview" })).toBe(true);
    expect(isDiagnosticsEnvironment({ VERCEL: "1", VERCEL_ENV: "production" })).toBe(false);
    expect(isDiagnosticsEnvironment({ VERCEL: "1", VERCEL_ENV: "development" })).toBe(false);
    expect(isDiagnosticsEnvironment({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isDiagnosticsEnvironment({})).toBe(false);
  });

  it("accepts only 64 lowercase hex characters as a token", () => {
    const valid = "0123456789abcdef".repeat(4);
    expect(isWellFormedToken(valid)).toBe(true);
    expect(isWellFormedToken(valid.slice(1))).toBe(false);
    expect(isWellFormedToken(`${valid}0`)).toBe(false);
    expect(isWellFormedToken(valid.toUpperCase())).toBe(false);
    expect(isWellFormedToken(`${valid.slice(0, 63)} `)).toBe(false);
    expect(isWellFormedToken(`${valid}, ${valid}`)).toBe(false);
    expect(isWellFormedToken(null)).toBe(false);
    expect(isWellFormedToken("")).toBe(false);
  });

  it("reads the configured token only when it is well formed", () => {
    expect(readConfiguredToken({ [DIAG_TOKEN_ENV]: "d".repeat(64) })).toBe("d".repeat(64));
    expect(readConfiguredToken({ [DIAG_TOKEN_ENV]: "short" })).toBeNull();
    expect(readConfiguredToken({})).toBeNull();
  });

  it("compares tokens by digest", () => {
    expect(tokensMatch("e".repeat(64), "e".repeat(64))).toBe(true);
    expect(tokensMatch("e".repeat(64), "f".repeat(64))).toBe(false);
  });

  it("exposes only the URL scheme", () => {
    expect(redisUrlScheme("rediss://default:pw@host.example:6379")).toBe("rediss:");
    expect(redisUrlScheme("redis://host:6379")).toBe("redis:");
    expect(redisUrlScheme("not a url")).toBeNull();
  });

  it("maps errors to fixed codes", () => {
    expect(classifyRedisError(new Error("Command timed out"))).toBe("REDIS_TIMEOUT");
    expect(classifyRedisError(Object.assign(new Error("x"), { code: "ECONNREFUSED" }))).toBe("REDIS_UNAVAILABLE");
    expect(classifyRedisError(new Error("Connection is closed."))).toBe("REDIS_UNAVAILABLE");
    expect(classifyRedisError(new Error(SECRETISH_MESSAGE))).toBe("INTERNAL");
    expect(classifyRedisError("not an error")).toBe("INTERNAL");
  });

  it("computes the gate from step statuses", () => {
    expect(computeGate([{ name: "connect", status: "PASS" }])).toBe("PASSED");
    expect(computeGate([{ name: "connect", status: "PASS" }, { name: "cleanup", status: "NOT_PROVEN" }])).toBe("INCONCLUSIVE");
    expect(computeGate([{ name: "connect", status: "UNSUPPORTED" }])).toBe("INCONCLUSIVE");
    expect(computeGate([{ name: "connect", status: "FAIL" }, { name: "cleanup", status: "PASS" }])).toBe("FAILED");
  });
});
