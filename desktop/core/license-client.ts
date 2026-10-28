import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  sign as nodeSign,
  type KeyObject,
} from "node:crypto";

import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";

import type { ContributionStats, FeedbackInput } from "../../src/domain/spell/feedback";
import { messageForCode, SPELL_TRANSFER_WARNING_MN } from "./messages";
import type { DocumentStore, SecretProtector } from "./store";

/**
 * TORE Spell desktop license client. Speaks the frozen Phase-1 protocol
 * (ADR-006/007/008): Ed25519 signed requests, server-signed EdDSA entitlement
 * tokens, offline grace bounded by the token's `exp`. The server decides
 * validity; the token only gates the UI between validations.
 */

export const SIGNATURE_VERSION = "TORE-SPELL-V1";
export const TOKEN_ISSUER = "tore-spell";
export const TOKEN_AUDIENCE = "tore-spell-desktop";
export const TOKEN_TYPE = "tore-spell+jwt";
/** Tolerated backwards clock movement before we demand an online validation. */
export const CLOCK_TOLERANCE_MS = 10 * 60 * 1000;

export type HttpRequest = { method: "GET" | "POST"; path: string; headers: Record<string, string>; body?: string };
export type HttpResponse = { status: number; json: unknown };
/** Injected so tests can call the real server handlers and Electron can use fetch. */
export type Transport = (req: HttpRequest) => Promise<HttpResponse>;

export type Grant = {
  status: "ACTIVATED" | "ALREADY_ACTIVE" | "TRANSFERRED" | "VALID";
  activationId: string;
  token: string;
  tokenValidUntil: string;
  refreshAfter: string;
  license: { id: string; planCode: string; startsAt: string; expiresAt: string };
  policy: { refreshIntervalSeconds: number; maxOfflineSeconds: number };
  serverTime: string;
};

export type ClientRecord = {
  version: 1;
  device: { publicKey: string; thumbprint: string; protectedPrivateKey: string };
  grant?: Grant;
  jwks?: JSONWebKeySet;
  /** Highest instant ever observed (ms epoch); guards against clock rollback. */
  highWaterMs: number;
  /** Why the last activation ended (server-confirmed), for UI copy. */
  endedReason?: string;
};

export type LicenseState =
  | { kind: "UNACTIVATED"; endedReason?: string }
  | { kind: "ACTIVE"; planCode: string; licenseExpiresAt: string; offlineUntil: string; refreshDue: boolean }
  | { kind: "VALIDATION_REQUIRED"; reason: "OFFLINE_LIMIT" | "CLOCK_ROLLBACK" | "TOKEN_INVALID"; detail?: TokenCheck }
  | { kind: "EXPIRED"; licenseExpiresAt: string };

export class SpellClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly messageMn: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "SpellClientError";
  }
}

/** Failures that say nothing about entitlement: local state keeps deciding. */
const TRANSIENT_CODES: ReadonlySet<string> = new Set(["NETWORK", "TOO_MANY_ATTEMPTS", "REQUEST_REPLAYED", "ACTIVATION_CONFLICT", "INTERNAL", "SPELL_NOT_CONFIGURED", "SPELL_DISABLED", "TOKEN_INVALID", "TOKEN_EXPIRED", "TOKEN_UNKNOWN_KEY", "TOKEN_BAD_SIGNATURE", "TOKEN_MALFORMED"]);

function withoutGrant(rec: ClientRecord): ClientRecord {
  const copy = { ...rec };
  delete copy.grant;
  return copy;
}

export type TokenCheck = "OK" | "EXPIRED" | "UNKNOWN_KEY" | "BAD_SIGNATURE" | "MALFORMED" | "INVALID";

const TOKEN_ERROR_CODE: Readonly<Record<Exclude<TokenCheck, "OK">, string>> = {
  EXPIRED: "TOKEN_EXPIRED",
  UNKNOWN_KEY: "TOKEN_UNKNOWN_KEY",
  BAD_SIGNATURE: "TOKEN_BAD_SIGNATURE",
  MALFORMED: "TOKEN_MALFORMED",
  INVALID: "TOKEN_INVALID",
};

const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");

export function buildCanonicalRequest(i: { method: string; path: string; timestamp: string; nonce: string; rawBody: string }): string {
  const bodyHash = createHash("sha256").update(i.rawBody, "utf8").digest("hex");
  return [SIGNATURE_VERSION, i.method.toUpperCase(), i.path, i.timestamp, i.nonce, bodyHash].join("\n");
}

export type ClientOptions = {
  store: DocumentStore<ClientRecord>;
  protector: SecretProtector;
  transport: Transport;
  appVersion: string;
  platform?: "WINDOWS" | "MACOS";
  /** Injectable clock (ms epoch). */
  now?: () => number;
  /** Public keys compiled into the app. Preferred over the fetched set; see docs for the trust trade-off. */
  pinnedJwks?: JSONWebKeySet;
  /** Release builds: refuse to run without pinned keys instead of trusting whatever the API returns. */
  requirePinned?: boolean;
  /** Optional non-secret hint shown in the admin UI; never required. */
  machineHint?: string;
};

export class SpellLicenseClient {
  private readonly now: () => number;
  constructor(private readonly o: ClientOptions) {
    this.now = o.now ?? Date.now;
    if (o.requirePinned && !(o.pinnedJwks && o.pinnedJwks.keys.length > 0)) {
      throw new SpellClientError("PINNED_KEYS_MISSING", "Программын тохиргоо дутуу байна. Албан ёсны суулгацыг дахин татна уу.");
    }
  }

  // ── identity ──────────────────────────────────────────────────────────────
  private record(): ClientRecord {
    const existing = this.o.store.read();
    if (existing) return existing;
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const x = (publicKey.export({ format: "jwk" }) as { x: string }).x;
    const der = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;
    const rec: ClientRecord = {
      version: 1,
      device: {
        publicKey: x,
        thumbprint: createHash("sha256").update(Buffer.from(x, "base64url")).digest("base64url"),
        protectedPrivateKey: this.o.protector.protect(der),
      },
      highWaterMs: this.now(),
    };
    this.o.store.write(rec);
    return rec;
  }

  private privateKey(rec: ClientRecord): KeyObject {
    return createPrivateKey({ key: this.o.protector.unprotect(rec.device.protectedPrivateKey), format: "der", type: "pkcs8" });
  }

  get thumbprint(): string {
    return this.record().device.thumbprint;
  }

  // ── transport ─────────────────────────────────────────────────────────────
  private async signedPost(rec: ClientRecord, path: string, body: unknown): Promise<unknown> {
    const rawBody = JSON.stringify(body);
    const timestamp = String(Math.floor(this.now() / 1000));
    const nonce = b64u(randomBytes(18));
    const signature = b64u(
      nodeSign(null, Buffer.from(buildCanonicalRequest({ method: "POST", path, timestamp, nonce, rawBody }), "utf8"), this.privateKey(rec)),
    );
    let res: HttpResponse;
    try {
      res = await this.o.transport({
        method: "POST",
        path,
        headers: {
          "content-type": "application/json",
          "x-spell-installation": rec.device.thumbprint,
          "x-spell-timestamp": timestamp,
          "x-spell-nonce": nonce,
          "x-spell-signature": signature,
        },
        body: rawBody,
      });
    } catch {
      throw new SpellClientError("NETWORK", messageForCode("NETWORK"));
    }
    if (res.status >= 200 && res.status < 300) return res.json;
    const j = (res.json ?? {}) as { code?: string; [k: string]: unknown };
    const code = typeof j.code === "string" ? j.code : "INTERNAL";
    const details = Object.fromEntries(Object.entries(j).filter(([k]) => k !== "code" && k !== "error"));
    throw new SpellClientError(code, code === "TRANSFER_CONFIRMATION_REQUIRED" ? SPELL_TRANSFER_WARNING_MN : messageForCode(code), details);
  }

  private async fetchJwks(): Promise<JSONWebKeySet | undefined> {
    try {
      const res = await this.o.transport({ method: "GET", path: "/api/spell/v1/keys", headers: {} });
      if (res.status === 200 && Array.isArray((res.json as JSONWebKeySet).keys)) return res.json as JSONWebKeySet;
    } catch {
      /* offline: keep the cached set */
    }
    return undefined;
  }

  // ── token verification (offline-capable) ──────────────────────────────────
  private async verifyToken(rec: ClientRecord, grant: Grant): Promise<TokenCheck> {
    const jwks = this.o.pinnedJwks ?? rec.jwks;
    if (!jwks) return "UNKNOWN_KEY";
    try {
      const { payload } = await jwtVerify(grant.token, createLocalJWKSet(jwks), {
        algorithms: ["EdDSA"],
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
        typ: TOKEN_TYPE,
        currentDate: new Date(this.now()),
        requiredClaims: ["exp", "iat", "jti", "sub"],
      });
      if (payload.inst !== rec.device.thumbprint || payload.act !== grant.activationId) return "INVALID";
      return "OK";
    } catch (e) {
      switch ((e as { code?: string }).code) {
        case "ERR_JWT_EXPIRED":
          return "EXPIRED";
        case "ERR_JWKS_NO_MATCHING_KEY":
        case "ERR_JWKS_MULTIPLE_MATCHING_KEYS":
          return "UNKNOWN_KEY";
        case "ERR_JWS_SIGNATURE_VERIFICATION_FAILED":
          return "BAD_SIGNATURE";
        case "ERR_JWS_INVALID":
        case "ERR_JWT_INVALID":
          return "MALFORMED";
        default:
          return "INVALID";
      }
    }
  }

  // ── public API ────────────────────────────────────────────────────────────
  /** Current gating state, computed locally (no network). Also advances the clock high-water mark. */
  async state(): Promise<LicenseState> {
    const rec = this.record();
    const grant = rec.grant;
    if (!grant) return { kind: "UNACTIVATED", endedReason: rec.endedReason };
    const now = this.now();
    if (now < rec.highWaterMs - CLOCK_TOLERANCE_MS) return { kind: "VALIDATION_REQUIRED", reason: "CLOCK_ROLLBACK" };
    if (now > rec.highWaterMs) this.o.store.write({ ...rec, highWaterMs: now });
    if (now >= Date.parse(grant.license.expiresAt)) return { kind: "EXPIRED", licenseExpiresAt: grant.license.expiresAt };
    const v = await this.verifyToken(rec, grant);
    if (v === "EXPIRED") return { kind: "VALIDATION_REQUIRED", reason: "OFFLINE_LIMIT" };
    if (v !== "OK") return { kind: "VALIDATION_REQUIRED", reason: "TOKEN_INVALID", detail: v };
    return {
      kind: "ACTIVE",
      planCode: grant.license.planCode,
      licenseExpiresAt: grant.license.expiresAt,
      offlineUntil: grant.tokenValidUntil,
      refreshDue: now >= Date.parse(grant.refreshAfter),
    };
  }

  /** True only when spell checking may run. */
  async isEntitled(): Promise<boolean> {
    return (await this.state()).kind === "ACTIVE";
  }

  private async accept(rec: ClientRecord, grant: Grant): Promise<Grant> {
    const fetched = this.o.pinnedJwks ? undefined : await this.fetchJwks();
    const next: ClientRecord = {
      ...rec,
      grant,
      jwks: fetched ?? rec.jwks,
      // Server time resets the rollback guard after a successful online round-trip.
      highWaterMs: Math.max(Date.parse(grant.serverTime) || 0, this.now()),
      endedReason: undefined,
    };
    // Never store a grant we cannot verify ourselves.
    const v = await this.verifyToken(next, grant);
    if (v !== "OK") throw new SpellClientError(TOKEN_ERROR_CODE[v], messageForCode(TOKEN_ERROR_CODE[v]), { check: v });
    this.o.store.write(next);
    return grant;
  }

  /** Activate (or, with `confirmTransferOfActivationId`, transfer) a license onto this computer. */
  async activate(code: string, opts: { confirmTransferOfActivationId?: string } = {}): Promise<Grant> {
    const rec = this.record();
    const grant = (await this.signedPost(rec, "/api/spell/v1/activations", {
      code: code.trim(),
      installation: {
        publicKey: rec.device.publicKey,
        platform: this.o.platform ?? "WINDOWS",
        appVersion: this.o.appVersion,
        ...(this.o.machineHint ? { machineHint: this.o.machineHint } : {}),
      },
      ...(opts.confirmTransferOfActivationId ? { confirmTransferOfActivationId: opts.confirmTransferOfActivationId } : {}),
    })) as Grant;
    return this.accept(rec, grant);
  }

  /**
   * Start-up / periodic server validation. A definitive refusal from the
   * server (revoked, transferred away, expired…) locks immediately; a network
   * failure never unlocks anything and never locks before the token's `exp`.
   */
  async validate(): Promise<LicenseState> {
    const rec = this.record();
    if (!rec.grant) return { kind: "UNACTIVATED", endedReason: rec.endedReason };
    try {
      const grant = (await this.signedPost(rec, "/api/spell/v1/validations", { activationId: rec.grant.activationId })) as Grant;
      await this.accept(rec, grant);
    } catch (e) {
      if (!(e instanceof SpellClientError)) throw e;
      if (e.code === "REQUEST_TIMESTAMP_INVALID") throw e; // the user must fix the clock
      if (!TRANSIENT_CODES.has(e.code)) {
        // Definitive server refusal: this computer no longer holds the license.
        this.o.store.write({ ...withoutGrant(this.o.store.read() ?? rec), endedReason: e.code });
      }
    }
    return this.state();
  }

  /** Send one report for the ACTIVE activation of this computer (signed like every device request). */
  async postFeedback(feedback: FeedbackInput): Promise<{ id: string; status: string; stats: ContributionStats }> {
    const rec = this.record();
    if (!rec.grant) throw new SpellClientError("NO_ACTIVATION", messageForCode("NO_ACTIVATION"));
    return (await this.signedPost(rec, "/api/spell/v1/feedback", { activationId: rec.grant.activationId, feedback })) as { id: string; status: string; stats: ContributionStats };
  }

  /** This account's contribution counts (accepted reports are the only credit). */
  async contributions(): Promise<ContributionStats> {
    const rec = this.record();
    if (!rec.grant) throw new SpellClientError("NO_ACTIVATION", messageForCode("NO_ACTIVATION"));
    return (await this.signedPost(rec, "/api/spell/v1/contributions", { activationId: rec.grant.activationId })) as ContributionStats;
  }

  /** Release this computer's activation (idempotent server-side), then forget the grant. */
  async deactivate(): Promise<void> {
    const rec = this.record();
    if (!rec.grant) return;
    await this.signedPost(rec, "/api/spell/v1/deactivations", { activationId: rec.grant.activationId });
    this.o.store.write({ ...withoutGrant(this.o.store.read() ?? rec), endedReason: "DEACTIVATED" });
  }
}
