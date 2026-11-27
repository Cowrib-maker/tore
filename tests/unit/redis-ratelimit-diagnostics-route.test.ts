import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shared = vi.hoisted(() => {
  class CountingRedis {
    readonly store = new Map<string, string>();
    commands = 0;
    async set(key: string, value: string, ...args: Array<string | number>) {
      this.commands += 1;
      const nx = args.map((a) => String(a).toUpperCase()).includes("NX");
      if (nx && this.store.has(key)) return null;
      this.store.set(key, value);
      return "OK";
    }
  }
  return {
    CountingRedis,
    current: { redis: null as InstanceType<typeof CountingRedis> | null },
    runCalls: { count: 0 },
  };
});

vi.mock("@/infrastructure/security/redis-client", () => ({
  getRedisClient: () => shared.current.redis,
}));

vi.mock("@/infrastructure/security/redis-ratelimit-diagnostics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infrastructure/security/redis-ratelimit-diagnostics")>();
  return {
    ...actual,
    runRedisRateLimitDiagnostics: async () => {
      shared.runCalls.count += 1;
      await new Promise((r) => setTimeout(r, 5));
      return { ok: true, gate: "PASSED" as const, steps: [{ name: "connect" as const, status: "PASS" as const }] };
    },
  };
});

import * as route from "@/app/api/diagnostics/redis-ratelimit/route";

const TOKEN = "0123456789abcdef".repeat(4);
const OTHER_TOKEN = "fedcba9876543210".repeat(4);
const REDIS_URL = "rediss://default:hunter2-secret@db.example-host.io:6379";
const URL_BASE = "https://preview.example.test/api/diagnostics/redis-ratelimit";

function req(method: string, token?: string): Request {
  const headers = new Headers();
  if (token !== undefined) headers.set("x-tore-diag-token", token);
  return new Request(URL_BASE, { method, headers });
}

async function snapshot(res: Response) {
  return {
    status: res.status,
    headers: [...res.headers.entries()].sort(),
    body: await res.text(),
  };
}

const EMPTY_404 = {
  status: 404,
  headers: [["cache-control", "no-store"]],
  body: "",
};

function previewEnv(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    VERCEL: "1",
    VERCEL_ENV: "preview",
    TORE_REDIS_DIAG_TOKEN: TOKEN,
    REDIS_URL,
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    vi.stubEnv(key, value as string);
  }
}

beforeEach(() => {
  shared.current.redis = new shared.CountingRedis();
  shared.runCalls.count = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("diagnostics route — exports", () => {
  it("explicitly exports every HTTP method plus runtime and maxDuration", () => {
    for (const method of ["POST", "GET", "HEAD", "OPTIONS", "PUT", "PATCH", "DELETE"] as const) {
      expect(typeof route[method]).toBe("function");
    }
    expect(route.runtime).toBe("nodejs");
    expect(route.maxDuration).toBe(30);
  });
});

describe("diagnostics route — non-POST methods", () => {
  const methods = ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "DELETE"] as const;
  const envs: Array<[string, Record<string, string | undefined>]> = [
    ["preview", {}],
    ["production", { VERCEL_ENV: "production" }],
    ["development", { VERCEL_ENV: "development" }],
    ["unset", { VERCEL: undefined, VERCEL_ENV: undefined }],
  ];

  for (const method of methods) {
    for (const [envName, overrides] of envs) {
      it(`${method} returns the same empty 404 (${envName}, valid token)`, async () => {
        previewEnv(overrides);
        const handler = route[method] as () => Promise<Response>;
        const res = await handler();
        expect(await snapshot(res)).toEqual(EMPTY_404);
        expect(res.headers.get("allow")).toBeNull();
        expect(shared.current.redis!.commands).toBe(0);
      });
    }
  }

  it("non-POST responses are byte-identical to a refused POST", async () => {
    previewEnv();
    const refused = await snapshot(await route.POST(req("POST", OTHER_TOKEN)));
    for (const method of methods) {
      const handler = route[method] as () => Promise<Response>;
      expect(await snapshot(await handler())).toEqual(refused);
    }
  });
});

describe("diagnostics route — POST refusals", () => {
  it.each([
    ["production", { VERCEL_ENV: "production" }],
    ["development", { VERCEL_ENV: "development" }],
    ["VERCEL_ENV unset", { VERCEL_ENV: undefined }],
    ["VERCEL unset", { VERCEL: undefined }],
  ])("returns 404 in %s with a valid token and never touches Redis", async (_name, overrides) => {
    previewEnv(overrides);
    const res = await route.POST(req("POST", TOKEN));
    expect(await snapshot(res)).toEqual(EMPTY_404);
    expect(shared.current.redis!.commands).toBe(0);
    expect(shared.runCalls.count).toBe(0);
  });

  it.each([
    ["missing header", undefined],
    ["63 characters", TOKEN.slice(1)],
    ["65 characters", `${TOKEN}0`],
    ["uppercase", TOKEN.toUpperCase()],
    ["comma-joined duplicate", `${TOKEN}, ${TOKEN}`],
    ["wrong token", OTHER_TOKEN],
  ])("returns the same empty 404 for a %s and never touches Redis", async (_name, token) => {
    previewEnv();
    const res = await route.POST(req("POST", token));
    expect(await snapshot(res)).toEqual(EMPTY_404);
    expect(shared.current.redis!.commands).toBe(0);
  });

  it.each([
    ["missing", undefined],
    ["malformed", "not-a-token"],
  ])("returns 404 when the configured token is %s", async (_name, value) => {
    previewEnv({ TORE_REDIS_DIAG_TOKEN: value });
    const res = await route.POST(req("POST", TOKEN));
    expect(await snapshot(res)).toEqual(EMPTY_404);
    expect(shared.current.redis!.commands).toBe(0);
  });

  it("returns the same empty 404 once the token has been used", async () => {
    previewEnv();
    expect((await route.POST(req("POST", TOKEN))).status).toBe(200);
    const second = await route.POST(req("POST", TOKEN));
    expect(await snapshot(second)).toEqual(EMPTY_404);
    expect(shared.runCalls.count).toBe(1);
  });

  it("lets only one of two concurrent requests with the same token run", async () => {
    previewEnv();
    const [a, b] = await Promise.all([
      route.POST(req("POST", TOKEN)),
      route.POST(req("POST", TOKEN)),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 404]);
    expect(shared.runCalls.count).toBe(1);
  });
});

describe("diagnostics route — authorized responses leak nothing", () => {
  it("runs once and returns the report with no-store", async () => {
    previewEnv();
    const res = await route.POST(req("POST", TOKEN));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.text();
    expect(JSON.parse(body)).toMatchObject({ ok: true, gate: "PASSED" });
    for (const secret of [TOKEN, "hunter2", "example-host", "rediss://"]) {
      expect(body).not.toContain(secret);
    }
  });

  it("refuses a non-TLS REDIS_URL with a fixed code only", async () => {
    previewEnv({ REDIS_URL: "redis://default:hunter2-secret@db.example-host.io:6379" });
    const res = await route.POST(req("POST", TOKEN));
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ ok: false, gate: "FAILED", code: "REDIS_SCHEME_NOT_TLS", steps: [] });
    expect(body).not.toContain("hunter2");
    expect(body).not.toContain("example-host");
    expect(shared.runCalls.count).toBe(0);
  });

  it("logs only the gate and step counts", async () => {
    previewEnv();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await route.POST(req("POST", TOKEN));
    const logged = info.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain('"scope":"redis-diag"');
    for (const secret of [TOKEN, "hunter2", "example-host", "rediss://"]) {
      expect(logged).not.toContain(secret);
    }
  });
});

describe("diagnostics source — forbidden content", () => {
  const files = [
    "src/app/api/diagnostics/redis-ratelimit/route.ts",
    "src/infrastructure/security/redis-ratelimit-diagnostics.ts",
  ];
  for (const file of files) {
    const source = readFileSync(path.join(process.cwd(), file), "utf8");
    it(`${file} avoids destructive and out-of-scope references`, () => {
      expect(source).not.toMatch(/flush/i);
      expect(source).not.toMatch(/prisma/i);
      expect(source).not.toContain("@/lib/env");
      expect(source).not.toContain("@upstash/redis");
      expect(source).not.toContain("REDIS_KV_");
      expect(source).not.toContain("DATABASE_URL");
      expect(source).not.toMatch(/\bKEYS\b/);
      expect(source).not.toContain("console.error");
    });
  }

  it("the route never sets an Allow header and refuses through one helper", () => {
    const source = readFileSync(path.join(process.cwd(), files[0]!), "utf8");
    expect(source).not.toMatch(/["']allow["']/i);
    for (const method of ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "DELETE"]) {
      expect(source).toMatch(new RegExp(`export async function ${method}\\(\\): Promise<Response> \\{\\s*return emptyNotFound\\(\\);`));
    }
  });
});
