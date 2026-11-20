import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SPELL_MAX_BODY_BYTES,
  assertSameOrigin,
  parseOrThrow,
  readBoundedBody,
  spellErrorResponse,
  toSignedRequest,
} from "@/application/common/spell-http";
import { activateRequestSchema, issueLicenseSchema } from "@/application/validators/spell.schema";
import { ForbiddenError, NotFoundError } from "@/domain/errors/domain-error";
import { SpellActiveActivationConflictError } from "@/domain/repositories/spell-activation-repository";
import { spellErrors } from "@/domain/spell/errors";
import { makeSpellEnv } from "./helpers/spell-kit";

const ENV_KEYS = ["TORE_SPELL_V1", ...Object.keys(makeSpellEnv())];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body), headers });

describe("Spell is dark by default (feature flag)", () => {
  it("every public route answers 404 SPELL_DISABLED while TORE_SPELL_V1 is off", async () => {
    delete process.env.TORE_SPELL_V1;
    const act = await import("@/app/api/spell/v1/activations/route");
    const val = await import("@/app/api/spell/v1/validations/route");
    const deact = await import("@/app/api/spell/v1/deactivations/route");
    const keys = await import("@/app/api/spell/v1/keys/route");
    const list = await import("@/app/api/spell/licenses/route");
    const adminList = await import("@/app/api/spell/admin/licenses/route");
    for (const res of [
      await act.POST(post("/api/spell/v1/activations", {})),
      await val.POST(post("/api/spell/v1/validations", {})),
      await deact.POST(post("/api/spell/v1/deactivations", {})),
      await keys.GET(),
      await list.GET(),
      await adminList.GET(new Request("http://localhost/api/spell/admin/licenses")),
      await adminList.POST(post("/api/spell/admin/licenses", {})),
    ]) {
      expect(res.status).toBe(404);
      expect((await res.json()).code).toBe("SPELL_DISABLED");
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("answers 503 SPELL_NOT_CONFIGURED when enabled without keys, and never echoes config", async () => {
    process.env.TORE_SPELL_V1 = "1";
    for (const k of Object.keys(makeSpellEnv())) delete process.env[k];
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const keys = await import("@/app/api/spell/v1/keys/route");
    const res = await keys.GET();
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("SPELL_NOT_CONFIGURED");
    expect(err).toHaveBeenCalled();
    expect(JSON.stringify(err.mock.calls)).toMatch(/SPELL_SIGNING_KEYS/);
  });

  it("publishes only PUBLIC verification keys when configured", async () => {
    process.env.TORE_SPELL_V1 = "1";
    Object.assign(process.env, makeSpellEnv());
    const keys = await import("@/app/api/spell/v1/keys/route");
    const res = await keys.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0]).toMatchObject({ kty: "OKP", crv: "Ed25519", alg: "EdDSA", use: "sig", kid: "k1" });
    expect(body.keys[0].d).toBeUndefined();
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
  });

  it("device routes reject malformed bodies with 422 before touching any state", async () => {
    process.env.TORE_SPELL_V1 = "1";
    Object.assign(process.env, makeSpellEnv());
    const act = await import("@/app/api/spell/v1/activations/route");
    const res = await act.POST(post("/api/spell/v1/activations", { code: "x" }));
    expect(res.status).toBe(422);
    const bad = await act.POST(new Request("http://localhost/api/spell/v1/activations", { method: "POST", body: "{not json" }));
    expect(bad.status).toBe(422);
  });
});

describe("request plumbing", () => {
  it("bounds the body size (declared and actual) and keeps the exact signed bytes", async () => {
    const big = "x".repeat(SPELL_MAX_BODY_BYTES + 1);
    await expect(readBoundedBody(new Request("http://x", { method: "POST", body: big }))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      readBoundedBody(new Request("http://x", { method: "POST", body: "{}", headers: { "content-length": String(SPELL_MAX_BODY_BYTES + 5) } })),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const raw = '{ "a" : 1 }';
    const r = await readBoundedBody(new Request("http://x", { method: "POST", body: raw }));
    expect(r.rawBody).toBe(raw);
    expect(r.json).toEqual({ a: 1 });
    expect((await readBoundedBody(new Request("http://x", { method: "POST" }))).json).toEqual({});
  });

  it("signs the pathname only (no query string) and reads the four device headers", () => {
    const req = new Request("http://localhost/api/spell/v1/validations?x=1", {
      method: "POST",
      headers: { "x-spell-installation": "i", "x-spell-timestamp": "1", "x-spell-nonce": "n", "x-spell-signature": "s" },
    });
    expect(toSignedRequest(req, "{}", "iph")).toEqual({
      method: "POST",
      path: "/api/spell/v1/validations",
      rawBody: "{}",
      headers: { installation: "i", timestamp: "1", nonce: "n", signature: "s" },
      ipHash: "iph",
    });
  });

  it("CSRF guard: a cross-origin browser POST is refused; same-origin and non-browser pass", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    const mk = (origin?: string) => new Request("http://localhost:3000/x", { method: "POST", headers: origin ? { origin } : {} });
    expect(() => assertSameOrigin(mk())).not.toThrow();
    expect(() => assertSameOrigin(mk("http://localhost:3000"))).not.toThrow();
    expect(() => assertSameOrigin(mk("https://evil.example"))).toThrow(ForbiddenError);
    expect(() => assertSameOrigin(mk("http://localhost:3001"))).toThrow(ForbiddenError);
  });

  it("validates request shapes strictly", () => {
    const key = "A".repeat(43);
    const ok = { code: "TSPL-X", installation: { publicKey: key, platform: "WINDOWS", appVersion: "1.0.0" } };
    expect(parseOrThrow(activateRequestSchema, ok).installation.platform).toBe("WINDOWS");
    for (const bad of [
      { ...ok, installation: { ...ok.installation, platform: "LINUX" } },
      { ...ok, installation: { ...ok.installation, publicKey: "has spaces" } },
      { ...ok, code: "x".repeat(65) },
      { installation: ok.installation },
    ]) {
      expect(() => parseOrThrow(activateRequestSchema, bad)).toThrow();
    }
    expect(() => parseOrThrow(issueLicenseSchema, { planCode: "SPELL_1M", source: "PURCHASE" })).toThrow();
    expect(parseOrThrow(issueLicenseSchema, { planCode: "SPELL_1M", source: "PROMO" }).source).toBe("PROMO");
  });
});

describe("error mapping", () => {
  it("maps Spell errors to their status, code and safe details, always uncached", async () => {
    const res = spellErrorResponse(spellErrors.transferCooldownActive(new Date("2026-11-01T00:00:00Z")));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "TRANSFER_COOLDOWN_ACTIVE", transferAvailableAt: "2026-11-01T00:00:00.000Z" });
    expect(res.headers.get("cache-control")).toBe("no-store");

    const limited = spellErrorResponse(spellErrors.tooManyAttempts(900));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("900");

    const confirm = spellErrorResponse(spellErrors.transferConfirmationRequired({ warning: "w", replacesActivationId: "a" }));
    expect(confirm.status).toBe(409);
    expect(await confirm.json()).toMatchObject({ code: "TRANSFER_CONFIRMATION_REQUIRED", warning: "w", replacesActivationId: "a" });
  });

  it("maps an exhausted-retry conflict to a typed, retryable 409", async () => {
    const res = spellErrorResponse(new SpellActiveActivationConflictError());
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("ACTIVATION_CONFLICT");
  });

  it("maps domain errors and hides unexpected ones, logging only the error class", async () => {
    expect(spellErrorResponse(new NotFoundError("License")).status).toBe(404);
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = spellErrorResponse(new Error("secret code TSPL-AAAA leaked in message"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal error", code: "INTERNAL" });
    expect(JSON.stringify(err.mock.calls)).not.toContain("TSPL-AAAA");
  });
});
