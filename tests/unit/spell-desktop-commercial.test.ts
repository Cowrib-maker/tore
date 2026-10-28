import { generateKeyPairSync } from "node:crypto";

import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import { activateLicense } from "@/application/use-cases/spell/activate-license";
import { authenticateSignedRequest, toAuthenticateDeps } from "@/application/use-cases/spell/authenticate-installation-request";
import { getContributions, reviewFeedbackGroup, submitFeedback } from "@/application/use-cases/spell/feedback";
import { validateActivation } from "@/application/use-cases/spell/validate-activation";
import { SpellAttemptKind, SpellPlatform } from "@/domain/spell/enums";
import { SpellError } from "@/domain/spell/errors";
import { compareVersions, getSpellRelease, parseVersion, SPELL_RELEASE_ENV, SPELL_RELEASE_TOKEN_TYPE } from "@/domain/spell/update";
import { InMemorySpellFeedbackRepository } from "@/infrastructure/repositories/in-memory-spell-feedback-repository";
import { SpellLicenseClient, type ClientRecord, type Transport } from "../../desktop/core/license-client";
import { FeedbackOutbox, OUTBOX_MAX, type OutboxDoc } from "../../desktop/core/feedback-outbox";
import { DesktopSpellSession, type DictionaryDoc } from "../../desktop/core/spell-session";
import { MemoryStore, type SecretProtector } from "../../desktop/core/store";
import { checkForUpdate } from "../../desktop/core/update";
import { createSpellEngineV1 } from "@/spell-engine/bundled";
import { DAY, makeSpell } from "./helpers/spell-kit";

const HOUR = 3_600_000;
const protector: SecretProtector = {
  protect: (b) => `P1:${Buffer.from(b).reverse().toString("base64")}`,
  unprotect: (s) => Buffer.from(Buffer.from(s.slice(3), "base64")).reverse(),
};

/** A real Spell server (use cases + in-memory repositories) behind the desktop client's Transport. */
function world() {
  const s = makeSpell();
  const feedbackRepository = new InMemorySpellFeedbackRepository();
  const clock = { ms: s.t0.getTime() };
  let online = true;
  const jwks = s.tokenIssuer.publicJwks();
  let release: ReturnType<typeof getSpellRelease> = null;
  const transport: Transport = async (req) => {
    if (!online) throw new Error("offline");
    const now = new Date(clock.ms);
    try {
      if (req.method === "GET" && req.path === "/api/spell/v1/updates/latest") {
        return { status: 200, json: release ? { available: true, token: await s.tokenIssuer.signRelease(release, now) } : { available: false } };
      }
      if (req.method === "GET") return { status: 200, json: jwks };
      const raw = req.body ?? "";
      const body = JSON.parse(raw);
      const signed = {
        method: req.method, path: req.path, rawBody: raw,
        headers: { installation: req.headers["x-spell-installation"] ?? null, timestamp: req.headers["x-spell-timestamp"] ?? null, nonce: req.headers["x-spell-nonce"] ?? null, signature: req.headers["x-spell-signature"] ?? null },
        ipHash: null,
      };
      const d = toAuthenticateDeps(s.deps);
      const fdeps = { feedbackRepository, spell: s.deps };
      if (req.path.endsWith("/activations")) {
        const device = await authenticateSignedRequest(signed, d, SpellAttemptKind.ACTIVATE, { registerPublicKey: body.installation.publicKey }, now);
        return { status: 200, json: await activateLicense({ code: body.code, platform: SpellPlatform.WINDOWS, appVersion: body.installation.appVersion, machineHint: null, confirmTransferOfActivationId: body.confirmTransferOfActivationId ?? null, device, ipHash: null }, s.deps, now) };
      }
      const device = await authenticateSignedRequest(signed, d, SpellAttemptKind.VALIDATE, {}, now);
      if (req.path.endsWith("/validations")) return { status: 200, json: await validateActivation({ activationId: body.activationId, device, ipHash: null }, s.deps, now) };
      if (req.path.endsWith("/feedback")) return { status: 201, json: await submitFeedback({ device, activationId: body.activationId, feedback: body.feedback }, fdeps, now) };
      if (req.path.endsWith("/contributions")) return { status: 200, json: await getContributions({ device, activationId: body.activationId }, fdeps, now) };
      return { status: 404, json: { code: "NOT_FOUND" } };
    } catch (e) {
      if (e instanceof SpellError) return { status: e.statusCode, json: { error: e.message, code: e.code, ...(e.details ?? {}) } };
      if ((e as { code?: string }).code) return { status: 400, json: { error: "x", code: (e as { code: string }).code } };
      throw e;
    }
  };
  const mkClient = (extra: Partial<ConstructorParameters<typeof SpellLicenseClient>[0]> = {}) => {
    const store = new MemoryStore<ClientRecord>();
    return { store, client: new SpellLicenseClient({ store, protector, transport, appVersion: "1.0.0", now: () => clock.ms, ...extra }) };
  };
  return { s, clock, mkClient, transport, feedbackRepository, jwks, setOnline: (v: boolean) => (online = v), setRelease: (r: typeof release) => (release = r) };
}

describe("the commercial journey end to end (real server logic behind the real desktop client)", () => {
  it("licence → activation → spell checking → report → review → contribution credit", async () => {
    const w = world();
    const owner = w.s.addUser("buyer-1");
    const { code } = await w.s.issue({ ownerUserId: owner.userId });
    const { client } = w.mkClient();
    await client.activate(code);
    expect(await client.isEntitled()).toBe(true);

    const spell = new DesktopSpellSession(createSpellEngineV1(), new MemoryStore<DictionaryDoc>(), client);
    const checked = await spell.check("Энэ надэд нь");
    expect(checked.locked).toBe(false);

    const outbox = new FeedbackOutbox(new MemoryStore<OutboxDoc>(), client);
    outbox.enqueue({ feedbackType: "WRONG_SUGGESTION", token: "надэд", engineSuggestion: "надад", userSuggestion: "надад", engineVersion: "1.0.0-alpha.2", dataVersion: "d" });
    const r = await outbox.flush();
    expect(r).toMatchObject({ sent: 1, pending: 0, dropped: 0 });
    expect(w.feedbackRepository.rows[0]).toMatchObject({ userId: "buyer-1", status: "PENDING", token: "надэд" });
    expect(r.stats).toEqual({ submitted: 1, accepted: 0, rejected: 0, pending: 1 });

    await reviewFeedbackGroup(w.s.admin, { groupKey: w.feedbackRepository.rows[0]!.groupKey, decision: "ACCEPT", reason: "valid report" }, { feedbackRepository: w.feedbackRepository });
    expect(await client.contributions()).toEqual({ submitted: 1, accepted: 1, rejected: 0, pending: 0 });
  });

  it("one licence = one active computer: a second computer is refused until an explicit transfer", async () => {
    const w = world();
    const { code } = await w.s.issue();
    const a = w.mkClient().client;
    const b = w.mkClient().client;
    await a.activate(code);
    await expect(b.activate(code)).rejects.toMatchObject({ code: "TRANSFER_CONFIRMATION_REQUIRED" });
    expect((await b.state()).kind).toBe("UNACTIVATED");
    expect((await a.state()).kind).toBe("ACTIVE"); // nothing was moved silently
  });
});

describe("feedback outbox (offline-first, privacy-minimal)", () => {
  const f = { feedbackType: "MISSING_WORD" as const, token: "бүлжирэн", engineVersion: "1", dataVersion: "d" };
  it("refuses a sentence before anything is stored", () => {
    const o = new FeedbackOutbox(new MemoryStore<OutboxDoc>(), { postFeedback: async () => ({ id: "x", status: "PENDING", stats: { submitted: 0, accepted: 0, rejected: 0, pending: 0 } }) });
    expect(() => o.enqueue({ ...f, token: "Энэ бол миний бүтэн өгүүлбэр" })).toThrow();
    expect(o.pending()).toBe(0);
  });
  it("keeps reports while offline and sends them, oldest first, once back online", async () => {
    const w = world();
    const owner = w.s.addUser("u1");
    const { code } = await w.s.issue({ ownerUserId: owner.userId });
    const { client } = w.mkClient();
    await client.activate(code);
    const o = new FeedbackOutbox(new MemoryStore<OutboxDoc>(), client);
    w.setOnline(false);
    o.enqueue({ ...f, token: "аль" });
    o.enqueue({ ...f, token: "бэ" });
    expect(await o.flush()).toMatchObject({ sent: 0, pending: 2 });
    w.setOnline(true);
    expect(await o.flush()).toMatchObject({ sent: 2, pending: 0 });
    expect(w.feedbackRepository.rows.map((r) => r.token)).toEqual(["аль", "бэ"]);
  });
  it("a definitive refusal of the content drops the report instead of retrying forever", async () => {
    const o = new FeedbackOutbox(new MemoryStore<OutboxDoc>(), { postFeedback: async () => { throw Object.assign(new Error("x"), { code: "VALIDATION_ERROR" }); } });
    o.enqueue(f);
    expect(await o.flush()).toMatchObject({ sent: 0, pending: 0, dropped: 1 });
  });
  it("is capped, and stores only the report fields (no document text)", () => {
    const store = new MemoryStore<OutboxDoc>();
    const o = new FeedbackOutbox(store, { postFeedback: async () => { throw new Error("n"); } });
    for (let i = 0; i < OUTBOX_MAX + 20; i += 1) o.enqueue(f);
    expect(o.pending()).toBe(OUTBOX_MAX);
    expect(Object.keys(store.read()!.entries[0]!.feedback).sort()).toEqual(["comment", "dataVersion", "engineSuggestion", "engineVersion", "feedbackType", "reasonCode", "token", "userSuggestion"]);
  });
  it("reports wait (not lost) while the licence is expired, and go out after a new licence is activated", async () => {
    const w = world();
    const owner = w.s.addUser("u1");
    const { code } = await w.s.issue({ ownerUserId: owner.userId });
    const { client } = w.mkClient();
    await client.activate(code);
    const o = new FeedbackOutbox(new MemoryStore<OutboxDoc>(), client);
    o.enqueue(f);
    w.clock.ms += 200 * DAY; // the 3-month licence ended
    expect((await client.state()).kind).toBe("EXPIRED");
    expect(await o.flush()).toMatchObject({ sent: 0, pending: 1 });
    const next = await w.s.issue({ ownerUserId: owner.userId, now: new Date(w.clock.ms) });
    await client.activate(next.code);
    expect(await o.flush()).toMatchObject({ sent: 1, pending: 0 });
  });
});

describe("expiry and renewal never destroy user data", () => {
  it("the personal dictionary survives expiry; checking is locked while expired and works again after a NEW licence", async () => {
    const w = world();
    const { code } = await w.s.issue();
    const { client } = w.mkClient();
    await client.activate(code);
    const dict = new MemoryStore<DictionaryDoc>();
    const spell = new DesktopSpellSession(createSpellEngineV1(), dict, client);
    spell.addToDictionary("Бүлжирэн");
    w.clock.ms += 200 * DAY;
    expect((await spell.check("Бүлжирэн")).locked).toBe(true);
    expect(dict.read()!.words).toContain("Бүлжирэн"); // still on disk
    const next = await w.s.issue({ now: new Date(w.clock.ms) });
    await client.activate(next.code);
    const again = new DesktopSpellSession(createSpellEngineV1(), dict, client);
    const r = await again.check("Бүлжирэн", { reportUnknown: true });
    expect(r.locked).toBe(false);
    if (!r.locked) expect(r.issues).toEqual([]); // the personal word is respected after renewal
  });
  it("the offline window stays 24 hours: usable at 23 h, validation required after", async () => {
    const w = world();
    const { code } = await w.s.issue();
    const { client } = w.mkClient();
    await client.activate(code);
    w.setOnline(false);
    w.clock.ms += 23 * HOUR;
    expect((await client.state()).kind).toBe("ACTIVE");
    w.clock.ms += 2 * HOUR;
    expect(await client.state()).toMatchObject({ kind: "VALIDATION_REQUIRED", reason: "OFFLINE_LIMIT" });
  });
});

describe("version ordering", () => {
  it("compares semantic versions and treats a pre-release as older than its release", () => {
    expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
    expect(compareVersions("1.2.0", "1.10.0")).toBe(-1);
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0-alpha.2", "1.0.0")).toBe(-1);
    expect(compareVersions("1.0.0-alpha.2", "1.0.0-alpha.10")).toBe(-1);
    expect(compareVersions("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1);
    expect(compareVersions("1.0", "1.0.0")).toBeNull();
    expect(parseVersion("v1.0.0")).toBeNull();
  });
});

describe("release configuration never invents a URL or a hash", () => {
  const ok = { [SPELL_RELEASE_ENV.version]: "1.0.1", [SPELL_RELEASE_ENV.installerUrl]: "https://downloads.example.test/TORE-Spell-Setup.exe", [SPELL_RELEASE_ENV.sha256]: "a".repeat(64) };
  it("returns null unless version, https URL and SHA-256 are all present and valid", () => {
    expect(getSpellRelease({})).toBeNull();
    expect(getSpellRelease(ok)).toMatchObject({ version: "1.0.1", sha256: "a".repeat(64), size: null, minSupportedVersion: null });
    expect(getSpellRelease({ ...ok, [SPELL_RELEASE_ENV.installerUrl]: "http://x.test/a.exe" })).toBeNull();
    expect(getSpellRelease({ ...ok, [SPELL_RELEASE_ENV.installerUrl]: "not a url" })).toBeNull();
    expect(getSpellRelease({ ...ok, [SPELL_RELEASE_ENV.sha256]: "abc" })).toBeNull();
    expect(getSpellRelease({ ...ok, [SPELL_RELEASE_ENV.version]: "latest" })).toBeNull();
    expect(getSpellRelease({ ...ok, [SPELL_RELEASE_ENV.size]: "1048576", [SPELL_RELEASE_ENV.minVersion]: "1.0.0" })).toMatchObject({ size: 1048576, minSupportedVersion: "1.0.0" });
  });
});

describe("update check: signed, verified, informational — never downloads or runs anything", () => {
  const rel = getSpellRelease({ [SPELL_RELEASE_ENV.version]: "1.1.0", [SPELL_RELEASE_ENV.installerUrl]: "https://downloads.example.test/TORE-Spell-Setup.exe", [SPELL_RELEASE_ENV.sha256]: "b".repeat(64), [SPELL_RELEASE_ENV.minVersion]: "1.0.5" })!;
  it("reports an available update from a correctly signed notice", async () => {
    const w = world();
    w.setRelease(rel);
    expect(await checkForUpdate({ currentVersion: "1.0.0", transport: w.transport, pinnedJwks: w.jwks, now: () => w.clock.ms })).toEqual({ kind: "UPDATE_AVAILABLE", version: "1.1.0", sha256: "b".repeat(64), required: true });
    expect(await checkForUpdate({ currentVersion: "1.0.9", transport: w.transport, pinnedJwks: w.jwks, now: () => w.clock.ms })).toMatchObject({ kind: "UPDATE_AVAILABLE", required: false });
  });
  it("is quiet when up to date, when nothing is published, when offline, or without pinned keys", async () => {
    const w = world();
    expect(await checkForUpdate({ currentVersion: "1.0.0", transport: w.transport, pinnedJwks: w.jwks })).toEqual({ kind: "UNAVAILABLE" });
    w.setRelease(rel);
    expect(await checkForUpdate({ currentVersion: "1.1.0", transport: w.transport, pinnedJwks: w.jwks, now: () => w.clock.ms })).toEqual({ kind: "UP_TO_DATE" });
    expect(await checkForUpdate({ currentVersion: "2.0.0", transport: w.transport, pinnedJwks: w.jwks, now: () => w.clock.ms })).toEqual({ kind: "UP_TO_DATE" }); // never a downgrade
    expect(await checkForUpdate({ currentVersion: "1.0.0", transport: w.transport, pinnedJwks: undefined })).toEqual({ kind: "UNAVAILABLE" });
    w.setOnline(false);
    expect(await checkForUpdate({ currentVersion: "1.0.0", transport: w.transport, pinnedJwks: w.jwks })).toEqual({ kind: "UNAVAILABLE" });
  });
  it("rejects a notice signed by an unknown key, an expired notice, a wrong token type, and garbage", async () => {
    const w = world();
    const forge = async (opts: { typ?: string; exp?: number } = {}) => {
      const { privateKey } = generateKeyPairSync("ed25519");
      return new SignJWT({ rel: "9.9.9", sha256: "c".repeat(64) })
        .setProtectedHeader({ alg: "EdDSA", kid: w.jwks.keys[0]!.kid as string, typ: opts.typ ?? SPELL_RELEASE_TOKEN_TYPE })
        .setIssuer("tore-spell").setAudience("tore-spell-desktop").setIssuedAt().setExpirationTime(opts.exp ?? Math.floor(Date.now() / 1000) + 600)
        .sign(privateKey);
    };
    const via = (token: string): Transport => async () => ({ status: 200, json: { available: true, token } });
    for (const token of [await forge(), "garbage", ""]) {
      expect(await checkForUpdate({ currentVersion: "1.0.0", transport: via(token), pinnedJwks: w.jwks })).toEqual({ kind: "UNAVAILABLE" });
    }
    // right key, wrong type / expired:
    const genuine = await w.s.tokenIssuer.signRelease(rel, new Date(w.clock.ms - 30 * DAY));
    expect(await checkForUpdate({ currentVersion: "1.0.0", transport: via(genuine), pinnedJwks: w.jwks, now: () => w.clock.ms })).toEqual({ kind: "UNAVAILABLE" }); // 30 days old > 7-day lifetime
    const entitlementLike = await w.s.tokenIssuer.issue({ licenseId: "l", activationId: "a", installationThumbprint: "t".repeat(43), planCode: "SPELL_1M" as never, licenseExpiresAt: new Date(w.clock.ms + DAY), now: new Date(w.clock.ms), maxOfflineSeconds: 3600, refreshIntervalSeconds: 600 });
    expect(await checkForUpdate({ currentVersion: "1.0.0", transport: via(entitlementLike.token), pinnedJwks: w.jwks, now: () => w.clock.ms })).toEqual({ kind: "UNAVAILABLE" }); // an entitlement token is not a release notice
  });
});
