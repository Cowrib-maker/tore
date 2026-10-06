import { describe, expect, it } from "vitest";

import { activateLicense } from "@/application/use-cases/spell/activate-license";
import { authenticateSignedRequest, toAuthenticateDeps } from "@/application/use-cases/spell/authenticate-installation-request";
import { deactivateOwnActivation } from "@/application/use-cases/spell/deactivate-activation";
import { validateActivation } from "@/application/use-cases/spell/validate-activation";
import { buildCanonicalRequest as serverCanonical } from "@/domain/spell/device-identity";
import { SpellAttemptKind, SpellPlatform } from "@/domain/spell/enums";
import { SpellError } from "@/domain/spell/errors";
import { buildCanonicalRequest as clientCanonical, SpellLicenseClient, type ClientRecord, type Transport } from "../../desktop/core/license-client";
import { formatUlaanbaatar } from "../../desktop/core/messages";
import { DesktopSpellSession, StaleIssueError, type DictionaryDoc } from "../../desktop/core/spell-session";
import { MemoryStore, type SecretProtector } from "../../desktop/core/store";
import { createSpellEngineV1 } from "@/spell-engine/bundled";
import { revokeSpellLicense } from "@/application/use-cases/spell/admin-licenses";
import { generateKeyPairSync } from "node:crypto";
import { DAY, makeSpell } from "./helpers/spell-kit";

const HOUR = 3_600_000;

/** Reversible stand-in for DPAPI; proves the key is never stored raw. */
const protector: SecretProtector = {
  protect: (b) => `P1:${Buffer.from(b).reverse().toString("base64")}`,
  unprotect: (s) => Buffer.from(Buffer.from(s.slice(3), "base64")).reverse(),
};

function world() {
  const s = makeSpell();
  const clock = { ms: s.t0.getTime() };
  const jwks = s.tokenIssuer.publicJwks();
  let online = true;
  const transport: Transport = async (req) => {
    if (!online) throw new Error("offline");
    const now = new Date(clock.ms);
    try {
      if (req.method === "GET") return { status: 200, json: jwks };
      const raw = req.body ?? "";
      const body = JSON.parse(raw);
      const signed = {
        method: req.method,
        path: req.path,
        rawBody: raw,
        headers: {
          installation: req.headers["x-spell-installation"] ?? null,
          timestamp: req.headers["x-spell-timestamp"] ?? null,
          nonce: req.headers["x-spell-nonce"] ?? null,
          signature: req.headers["x-spell-signature"] ?? null,
        },
        ipHash: null,
      };
      const d = toAuthenticateDeps(s.deps);
      if (req.path.endsWith("/activations")) {
        const device = await authenticateSignedRequest(signed, d, SpellAttemptKind.ACTIVATE, { registerPublicKey: body.installation.publicKey }, now);
        return { status: 200, json: await activateLicense({ code: body.code, platform: SpellPlatform.WINDOWS, appVersion: body.installation.appVersion, machineHint: null, confirmTransferOfActivationId: body.confirmTransferOfActivationId ?? null, device, ipHash: null }, s.deps, now) };
      }
      if (req.path.endsWith("/validations")) {
        const device = await authenticateSignedRequest(signed, d, SpellAttemptKind.VALIDATE, {}, now);
        return { status: 200, json: await validateActivation({ activationId: body.activationId, device, ipHash: null }, s.deps, now) };
      }
      const device = await authenticateSignedRequest(signed, d, SpellAttemptKind.DEACTIVATE, {}, now);
      return { status: 200, json: await deactivateOwnActivation({ activationId: body.activationId, device, ipHash: null }, s.deps, now) };
    } catch (e) {
      if (e instanceof SpellError) return { status: e.statusCode, json: { error: e.message, code: e.code, ...(e.details ?? {}) } };
      throw e;
    }
  };
  const mkClient = (extra: Partial<ConstructorParameters<typeof SpellLicenseClient>[0]> = {}) => {
    const store = new MemoryStore<ClientRecord>();
    return { store, client: new SpellLicenseClient({ store, protector, transport, appVersion: "1.0.0", now: () => clock.ms, ...extra }) };
  };
  return { s, clock, mkClient, jwks, setOnline: (v: boolean) => (online = v) };
}

describe("desktop license client", () => {
  it("canonical request is byte-identical to the server's", () => {
    const i = { method: "post", path: "/api/spell/v1/validations", timestamp: "1", nonce: "n".repeat(20), rawBody: '{"a":1}' };
    expect(clientCanonical(i)).toBe(serverCanonical(i));
  });

  it("activates, verifies the token locally, and never stores the private key unprotected", async () => {
    const w = world();
    const { code } = await w.s.issue();
    const { client, store } = w.mkClient();
    expect((await client.state()).kind).toBe("UNACTIVATED");
    const g = await client.activate(code);
    expect(g.status).toBe("ACTIVATED");
    const st = await client.state();
    expect(st).toMatchObject({ kind: "ACTIVE", refreshDue: false });
    const raw = JSON.stringify(store.read());
    expect(raw).toContain("P1:");
    expect(raw).not.toContain(code);
  });

  it("wrong code → Mongolian message, stays unactivated", async () => {
    const w = world();
    const { client } = w.mkClient();
    await expect(client.activate("TORE-AAAA-BBBB-CCCC-DDDD")).rejects.toMatchObject({ code: "LICENSE_CODE_INVALID", messageMn: expect.stringContaining("License код") });
    expect((await client.state()).kind).toBe("UNACTIVATED");
  });

  it("works offline until the token's hard limit, then demands validation", async () => {
    const w = world();
    const { code } = await w.s.issue();
    const { client } = w.mkClient();
    await client.activate(code);
    w.setOnline(false);
    w.clock.ms += 13 * HOUR;
    expect(await client.state()).toMatchObject({ kind: "ACTIVE", refreshDue: true });
    expect((await client.validate()).kind).toBe("ACTIVE"); // network failure never locks early
    w.clock.ms += 12 * HOUR; // past 24 h
    expect(await client.state()).toEqual({ kind: "VALIDATION_REQUIRED", reason: "OFFLINE_LIMIT" });
    expect(await client.isEntitled()).toBe(false);
    w.setOnline(true);
    expect((await client.validate()).kind).toBe("ACTIVE");
  });

  it("clock rollback locks until an online validation", async () => {
    const w = world();
    const { code } = await w.s.issue();
    const { client } = w.mkClient();
    await client.activate(code);
    w.clock.ms += 5 * HOUR;
    await client.state(); // advances high-water mark
    w.clock.ms -= 4 * HOUR;
    expect(await client.state()).toEqual({ kind: "VALIDATION_REQUIRED", reason: "CLOCK_ROLLBACK" });
  });

  it("expired license is EXPIRED and is not auto-renewed", async () => {
    const w = world();
    const { code } = await w.s.issue(); // 3 months
    const { client } = w.mkClient();
    await client.activate(code);
    w.clock.ms += 100 * DAY;
    expect((await client.state()).kind).toBe("EXPIRED");
    const st = await client.validate();
    expect(st.kind === "EXPIRED" || st.kind === "UNACTIVATED").toBe(true);
    expect(await client.isEntitled()).toBe(false);
  });

  it("transfer: needs explicit confirmation; the old computer is locked at its next validation", async () => {
    const w = world();
    const { code } = await w.s.issue();
    const A = w.mkClient();
    const B = w.mkClient();
    const gA = await A.client.activate(code);
    const err = await B.client.activate(code).catch((e) => e);
    expect(err.code).toBe("TRANSFER_CONFIRMATION_REQUIRED");
    expect(err.messageMn).toContain("өөр компьютерт идэвхтэй");
    expect(err.details.replacesActivationId).toBe(gA.activationId);
    const gB = await B.client.activate(code, { confirmTransferOfActivationId: err.details.replacesActivationId });
    expect(gB.status).toBe("TRANSFERRED");
    expect((await B.client.state()).kind).toBe("ACTIVE");
    // A is still locally ACTIVE (offline-grace honesty) until it validates…
    expect((await A.client.state()).kind).toBe("ACTIVE");
    const after = await A.client.validate();
    expect(after).toMatchObject({ kind: "UNACTIVATED", endedReason: "ACTIVATION_NOT_ACTIVE" });
    expect(await A.client.isEntitled()).toBe(false);
    // …and a second immediate transfer back is refused by the cooldown.
    const back = await A.client.activate(code, { confirmTransferOfActivationId: gB.activationId }).catch((e) => e);
    expect(back.code).toBe("TRANSFER_COOLDOWN_ACTIVE");
  });

  it("deactivate releases the computer; a tampered stored token is rejected", async () => {
    const w = world();
    const { code } = await w.s.issue();
    const { client, store } = w.mkClient();
    await client.activate(code);
    const rec = store.read()!;
    store.write({ ...rec, grant: { ...rec.grant!, token: rec.grant!.token.slice(0, -4) + "AAAA" } });
    expect(await client.state()).toMatchObject({ kind: "VALIDATION_REQUIRED", reason: "TOKEN_INVALID" });
    store.write(rec);
    await client.deactivate();
    expect((await client.state()).kind).toBe("UNACTIVATED");
    expect(w.s.activeCount(rec.grant!.license.id)).toBe(0);
  });

  it("a token minted for another installation does not unlock this one", async () => {
    const w = world();
    const { code } = await w.s.issue();
    const A = w.mkClient();
    const B = w.mkClient();
    await A.client.activate(code);
    await B.client.state(); // creates B's identity
    B.store.write({ ...B.store.read()!, grant: A.store.read()!.grant, jwks: A.store.read()!.jwks });
    expect(await B.client.state()).toMatchObject({ kind: "VALIDATION_REQUIRED", reason: "TOKEN_INVALID", detail: "INVALID" });
  });

  it("shows times in Asia/Ulaanbaatar", () => {
    expect(formatUlaanbaatar("2026-10-05T16:30:00.000Z")).toBe("2026-10-06 00:30 (УБ)");
    expect(formatUlaanbaatar("2026-12-31T16:00:00.000Z")).toBe("2027-01-01 00:00 (УБ)");
  });
});

describe("desktop spell session", () => {
  const mk = (entitled = true) => {
    const dict = new MemoryStore<DictionaryDoc>();
    const session = new DesktopSpellSession(createSpellEngineV1(), dict, { isEntitled: async () => entitled });
    return { dict, session };
  };

  it("is locked without an entitlement and sends no text anywhere", async () => {
    expect(await mk(false).session.check("Монгол улс")).toEqual({ locked: true });
  });

  it("finds a misspelling, suggests, replaces; stale replacement is refused", async () => {
    const { session } = mk();
    const text = "Хууль тогтоох байгууллага хэрг шийдвэрлэв. Тэр өгсөн докумнт.";
    const r = await session.check(text, { reportUnknown: true });
    expect(r.locked).toBe(false);
    if (r.locked) return;
    const withFix = r.issues.find((i) => i.suggestions.length > 0);
    if (withFix) {
      const out = session.applyReplacement(text, withFix, withFix.suggestions[0]!);
      expect(out.text).toContain(withFix.suggestions[0]!);
      expect(() => session.applyReplacement("тэс", withFix, "x")).toThrow(StaleIssueError);
    }
  });

  it("ignore-all and personal dictionary silence a word; dictionary persists and is removable", async () => {
    const { session, dict } = mk();
    const text = "Бид Зоригтбаатар гэж нэрлэв.";
    const first = await session.check(text, { reportUnknown: true });
    if (first.locked) throw new Error("locked");
    const target = first.issues.find((i) => i.token === "Зоригтбаатар");
    if (target) {
      session.ignoreOnce(target);
      const again = await session.check(text, { reportUnknown: true });
      if (again.locked) throw new Error("locked");
      expect(again.issues.some((i) => i.token === "Зоригтбаатар")).toBe(false);
    }
    session.addToDictionary("Зоригтбаатар");
    expect(dict.read()!.words).toContain("Зоригтбаатар");
    const fresh = new DesktopSpellSession(createSpellEngineV1(), dict, { isEntitled: async () => true });
    const r = await fresh.check(text, { reportUnknown: true });
    if (r.locked) throw new Error("locked");
    expect(r.issues.some((i) => i.token === "Зоригтбаатар")).toBe(false);
    expect(fresh.removeFromDictionary("Зоригтбаатар")).toBe(true);
    expect(() => session.addToDictionary("12<script>")).toThrow("INVALID_DICTIONARY_WORD");
  });
});

describe("pinned production key (fail closed)", () => {
  const otherKeyJwks = (kid: string) => {
    const { publicKey } = generateKeyPairSync("ed25519");
    return { keys: [{ ...(publicKey.export({ format: "jwk" }) as object), kid, alg: "EdDSA", use: "sig" }] } as never;
  };

  it("release mode refuses to run without pinned keys", () => {
    const w = world();
    expect(() => w.mkClient({ requirePinned: true })).toThrowError(expect.objectContaining({ code: "PINNED_KEYS_MISSING" }));
    expect(() => w.mkClient({ requirePinned: true, pinnedJwks: { keys: [] } })).toThrowError(expect.objectContaining({ code: "PINNED_KEYS_MISSING" }));
  });

  it("valid pinned key: activation, local verification and offline use work; the API's key set is never consulted", async () => {
    const w = world();
    const { code } = await w.s.issue();
    const { client, store } = w.mkClient({ pinnedJwks: w.jwks, requirePinned: true });
    await client.activate(code);
    expect((await client.state()).kind).toBe("ACTIVE");
    expect(store.read()!.jwks).toBeUndefined();
  });

  it("wrong key with the SAME kid (server substitution) → rejected, nothing stored", async () => {
    const w = world();
    const { code } = await w.s.issue();
    const kid = w.jwks.keys[0]!.kid!;
    const { client, store } = w.mkClient({ pinnedJwks: otherKeyJwks(kid), requirePinned: true });
    await expect(client.activate(code)).rejects.toMatchObject({ code: "TOKEN_BAD_SIGNATURE", messageMn: expect.stringContaining("гарын үсэг") });
    expect(store.read()!.grant).toBeUndefined();
    expect((await client.state()).kind).toBe("UNACTIVATED");
  });

  it("rotated / unknown key id → rejected", async () => {
    const w = world();
    const { code } = await w.s.issue();
    const { client, store } = w.mkClient({ pinnedJwks: otherKeyJwks("some-other-kid"), requirePinned: true });
    await expect(client.activate(code)).rejects.toMatchObject({ code: "TOKEN_UNKNOWN_KEY" });
    expect(store.read()!.grant).toBeUndefined();
  });

  it("tampered stored token → locked with a signature reason; malformed → locked", async () => {
    const w = world();
    const { code } = await w.s.issue();
    const { client, store } = w.mkClient({ pinnedJwks: w.jwks, requirePinned: true });
    await client.activate(code);
    const rec = store.read()!;
    const [h, p, sig] = rec.grant!.token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p!, "base64url").toString()), plan: "SPELL_12M" })).toString("base64url");
    store.write({ ...rec, grant: { ...rec.grant!, token: `${h}.${forged}.${sig}` } });
    expect(await client.state()).toMatchObject({ kind: "VALIDATION_REQUIRED", reason: "TOKEN_INVALID", detail: "BAD_SIGNATURE" });
    store.write({ ...rec, grant: { ...rec.grant!, token: "not-a-jwt" } });
    expect(await client.state()).toMatchObject({ kind: "VALIDATION_REQUIRED", detail: "MALFORMED" });
    expect(await client.isEntitled()).toBe(false);
  });

  it("expired token → validation required (offline limit), then recovers online", async () => {
    const w = world();
    const { code } = await w.s.issue();
    const { client } = w.mkClient({ pinnedJwks: w.jwks, requirePinned: true });
    await client.activate(code);
    w.clock.ms += 25 * HOUR;
    expect(await client.state()).toEqual({ kind: "VALIDATION_REQUIRED", reason: "OFFLINE_LIMIT" });
    expect((await client.validate()).kind).toBe("ACTIVE");
  });

  it("revoked entitlement: the next online validation locks and records why; offline keeps the honest ≤24 h window", async () => {
    const w = world();
    const { code, license } = await w.s.issue();
    const { client } = w.mkClient({ pinnedJwks: w.jwks, requirePinned: true });
    await client.activate(code);
    await revokeSpellLicense(w.s.admin, license.id, "test revoke", w.s.deps, new Date(w.clock.ms));
    expect((await client.state()).kind).toBe("ACTIVE"); // not instant offline
    const after = await client.validate();
    expect(after).toMatchObject({ kind: "UNACTIVATED", endedReason: expect.stringMatching(/LICENSE_REVOKED|ACTIVATION_NOT_ACTIVE/) });
  });
});

describe("license error messages (Mongolian, no internals)", () => {
  it("every known server/client code has a Mongolian message without stack or crypto jargon", async () => {
    const { CLIENT_ERROR_MN } = await import("../../desktop/core/messages");
    const codes = ["LICENSE_CODE_INVALID", "LICENSE_EXPIRED", "LICENSE_REVOKED", "TRANSFER_CONFIRMATION_REQUIRED", "TRANSFER_COOLDOWN_ACTIVE", "NETWORK", "INTERNAL", "TOKEN_BAD_SIGNATURE", "TOKEN_UNKNOWN_KEY", "TOKEN_EXPIRED", "TOKEN_MALFORMED", "ACTIVATION_NOT_ACTIVE", "INSTALLATION_REVOKED"];
    for (const c of codes) {
      const m = CLIENT_ERROR_MN[c];
      expect(m, c).toBeTruthy();
      expect(m).toMatch(/[Ѐ-ӿ]/u);
      expect(m).not.toMatch(/stack|Error:|Ed25519|JWT|JWS|kid|signature/i);
    }
  });
});

describe("license error flows end to end (Mongolian messages)", () => {
  it("revoked license → LICENSE_REVOKED message at activation", async () => {
    const w = world();
    const { code, license } = await w.s.issue();
    await revokeSpellLicense(w.s.admin, license.id, "chargeback", w.s.deps, new Date(w.clock.ms));
    const { client } = w.mkClient();
    await expect(client.activate(code)).rejects.toMatchObject({ code: "LICENSE_REVOKED", messageMn: expect.stringContaining("хүчингүй") });
  });

  it("license past its expiry → LICENSE_EXPIRED (no auto-renew wording)", async () => {
    const w = world();
    const { code } = await w.s.issue();
    const { client } = w.mkClient();
    await client.activate(code);
    const other = w.mkClient();
    w.clock.ms += 400 * DAY;
    await expect(other.client.activate(code)).rejects.toMatchObject({ code: expect.stringMatching(/LICENSE_EXPIRED|LICENSE_REDEEM_WINDOW_CLOSED/) });
  });

  it("same computer activating again is idempotent (ALREADY_ACTIVE), never a transfer prompt", async () => {
    const w = world();
    const { code } = await w.s.issue();
    const { client } = w.mkClient();
    await client.activate(code);
    expect((await client.activate(code)).status).toBe("ALREADY_ACTIVE");
  });

  it("network failure → NETWORK message; local state unchanged", async () => {
    const w = world();
    const { code } = await w.s.issue();
    const { client } = w.mkClient();
    await client.activate(code);
    w.setOnline(false);
    await expect(client.activate(code)).rejects.toMatchObject({ code: "NETWORK", messageMn: expect.stringContaining("Интернэт") });
    expect((await client.state()).kind).toBe("ACTIVE");
  });

  it("server failure (HTTP 500 with internals in the body) → generic Mongolian message, no internals, still entitled locally", async () => {
    const w = world();
    const { code } = await w.s.issue();
    const { client } = w.mkClient();
    await client.activate(code);
    const failing = new SpellLicenseClient({
      store: new MemoryStore<ClientRecord>(),
      protector,
      appVersion: "1",
      now: () => w.clock.ms,
      transport: async () => ({ status: 500, json: { stack: "Error: boom at /srv/app.js:10" } }),
    });
    const err = await failing.activate(code).catch((e) => e);
    expect(err.code).toBe("INTERNAL");
    expect(err.messageMn).not.toMatch(/boom|\/srv|stack/);
    expect((await client.state()).kind).toBe("ACTIVE");
  });
});

describe("local feedback log («Алдаа мэдээлэх»)", () => {
  it("stores one word + verdict + versions, never surrounding text; exports TSV; caps size", async () => {
    const { FeedbackLog } = await import("../../desktop/core/feedback");
    const log = new FeedbackLog(new MemoryStore());
    const e = log.add({ kind: "WRONG_SUGGESTION", word: "нотлсон", verdict: "MISSPELLED", suggestion: "нотолсон", reasonCode: "STEM_VOWEL_MISSING", engineVersion: "1.0.0", dataPackVersion: "d1" });
    expect(e.at).toMatch(/^\d{4}-/);
    expect(() => log.add({ kind: "UNKNOWN_WORD", word: "Энэ бол миний бүтэн өгүүлбэр", verdict: "UNKNOWN", suggestion: null, reasonCode: null, engineVersion: "1", dataPackVersion: "d" })).toThrow("INVALID_FEEDBACK_WORD");
    expect(() => log.add({ kind: "UNKNOWN_WORD", word: "ok", verdict: null, suggestion: "a b c", reasonCode: null, engineVersion: "1", dataPackVersion: "d" })).toThrow("INVALID_FEEDBACK_SUGGESTION");
    expect(() => log.add({ kind: "BAD" as never, word: "ok", verdict: null, suggestion: null, reasonCode: null, engineVersion: "1", dataPackVersion: "d" })).toThrow("INVALID_FEEDBACK_KIND");
    const tsv = log.exportTsv().trim().split("\n");
    expect(tsv[0]).toContain("engineVersion\tdataPackVersion");
    expect(tsv).toHaveLength(2);
    expect(tsv[1]).toContain("нотлсон\tMISSPELLED\tнотолсон\tSTEM_VOWEL_MISSING");
    for (let i = 0; i < 520; i += 1) log.add({ kind: "UNKNOWN_WORD", word: "үг", verdict: "UNKNOWN", suggestion: null, reasonCode: null, engineVersion: "1", dataPackVersion: "d" });
    expect(log.count()).toBe(500);
  });
});
