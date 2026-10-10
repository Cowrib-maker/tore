import { generateKeyPairSync, randomBytes, sign as nodeSign } from "node:crypto";
import { SignJWT, UnsecuredJWT, decodeProtectedHeader } from "jose";
import { describe, expect, it } from "vitest";

import {
  buildCanonicalRequest,
  computeKeyThumbprint,
  parseRawEd25519PublicKey,
  verifyEd25519Signature,
} from "@/domain/spell/device-identity";
import { SpellPlanCode } from "@/domain/spell/enums";
import { KeyRingSpellCodeVault } from "@/infrastructure/spell/code-vault";
import {
  JoseSpellTokenIssuer,
  SPELL_TOKEN_AUDIENCE,
  SPELL_TOKEN_ISSUER,
  SPELL_TOKEN_TYPE,
  verifySpellEntitlementToken,
} from "@/infrastructure/spell/entitlement-token";
import { SpellConfigError, parseSpellConfig } from "@/infrastructure/spell/spell-config";
import { makeSpellEnv, newDevice, randomKeyB64, signingKeyB64, signRequest } from "./helpers/spell-kit";

const now = new Date("2026-10-05T09:00:00Z");
const HOUR = 3600;

describe("spell config", () => {
  it("parses a complete environment and applies the approved defaults", () => {
    const cfg = parseSpellConfig(makeSpellEnv());
    expect(cfg.policy.tokenMaxOfflineSeconds).toBe(24 * HOUR);
    expect(cfg.policy.tokenRefreshIntervalSeconds).toBe(12 * HOUR);
    expect(cfg.policy.redeemByDays).toBe(90);
    expect(cfg.policy.transferCooldownDays).toBe(30);
  });

  it("is configurable server-side", () => {
    const cfg = parseSpellConfig(
      makeSpellEnv({
        SPELL_TRANSFER_COOLDOWN_DAYS: "7",
        SPELL_REDEEM_BY_DAYS: "30",
        SPELL_TOKEN_MAX_OFFLINE_HOURS: "48",
        SPELL_TOKEN_REFRESH_INTERVAL_HOURS: "6",
      }),
    );
    expect(cfg.policy).toMatchObject({
      transferCooldownDays: 7,
      redeemByDays: 30,
      tokenMaxOfflineSeconds: 48 * HOUR,
      tokenRefreshIntervalSeconds: 6 * HOUR,
    });
  });

  it("refuses to weaken revocation beyond the guard rails", () => {
    for (const bad of [
      { SPELL_TOKEN_MAX_OFFLINE_HOURS: "169" },
      { SPELL_TOKEN_MAX_OFFLINE_HOURS: "0" },
      { SPELL_TOKEN_REFRESH_INTERVAL_HOURS: "24" },
      { SPELL_REDEEM_BY_DAYS: "0" },
      { SPELL_REDEEM_BY_DAYS: "abc" },
    ]) {
      expect(() => parseSpellConfig(makeSpellEnv(bad))).toThrow(SpellConfigError);
    }
  });

  it("fails closed on missing/invalid keys and never echoes secret values", () => {
    const secret = randomKeyB64();
    const env = makeSpellEnv({ SPELL_CODE_HMAC_KEYS: `h1:${secret.slice(0, 10)}`, SPELL_SIGNING_ACTIVE_KID: "nope" });
    delete (env as Record<string, string | undefined>).SPELL_CODE_ENC_KEYS;
    try {
      parseSpellConfig(env);
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SpellConfigError);
      const message = (error as Error).message;
      expect(message).toContain("SPELL_CODE_ENC_KEYS");
      expect(message).toContain("SPELL_CODE_HMAC_KEYS");
      expect(message).toContain("SPELL_SIGNING_ACTIVE_KID");
      expect(message).not.toContain(secret.slice(0, 10));
    }
  });

  it("rejects a non-Ed25519 signing key", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const der = (privateKey.export({ format: "der", type: "pkcs8" }) as Buffer).toString("base64");
    expect(() => parseSpellConfig(makeSpellEnv({ SPELL_SIGNING_KEYS: `k1:${der}` }))).toThrow(/Ed25519/);
  });
});

describe("license-code vault", () => {
  const cfg = parseSpellConfig(makeSpellEnv());
  const vault = new KeyRingSpellCodeVault(cfg.codeHmacKeys, cfg.codeEncryptionKeys);
  const code = "ABCDEFGHJKMNPQRSTVWXYZ01";

  it("hashes deterministically with a keyed, domain-separated HMAC (not a bare hash)", () => {
    const a = vault.hashForStorage(code);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(vault.hashForStorage(code).hash).toBe(a.hash);
    expect(vault.lookupHashes(code)).toContain(a.hash);
    const other = new KeyRingSpellCodeVault(
      parseSpellConfig(makeSpellEnv()).codeHmacKeys,
      cfg.codeEncryptionKeys,
    );
    expect(other.hashForStorage(code).hash).not.toBe(a.hash);
    expect(vault.hashIdentifier("client-ip", "1.2.3.4")).not.toBe(vault.hashIdentifier("machine-hint", "1.2.3.4"));
  });

  it("encrypts so the ciphertext never contains the plaintext and decrypts back", () => {
    const { ciphertext, keyVersion } = vault.encrypt(code, "lic-1");
    expect(keyVersion).toBe("e1");
    expect(Buffer.from(ciphertext).toString("latin1")).not.toContain(code);
    expect(vault.decrypt({ ciphertext, keyVersion, licenseId: "lic-1" })).toBe(code);
    // Fresh IV per encryption.
    expect(Buffer.from(vault.encrypt(code, "lic-1").ciphertext).equals(Buffer.from(ciphertext))).toBe(false);
  });

  it("binds ciphertext to its license and key version, and detects tampering", () => {
    const { ciphertext, keyVersion } = vault.encrypt(code, "lic-1");
    expect(() => vault.decrypt({ ciphertext, keyVersion, licenseId: "lic-2" })).toThrow();
    expect(() => vault.decrypt({ ciphertext, keyVersion: "e2", licenseId: "lic-1" })).toThrow();
    const tampered = Buffer.from(ciphertext);
    tampered[tampered.length - 1] ^= 1;
    expect(() => vault.decrypt({ ciphertext: tampered, keyVersion, licenseId: "lic-1" })).toThrow();
    expect(() => vault.decrypt({ ciphertext: new Uint8Array(5), keyVersion, licenseId: "lic-1" })).toThrow();
  });

  it("supports encryption-key rotation: old rows stay readable, reencrypt moves them to the active key", () => {
    const e1 = randomKeyB64();
    const e2 = randomKeyB64();
    const h = cfg.codeHmacKeys;
    const v1 = new KeyRingSpellCodeVault(h, { activeId: "e1", keys: new Map([["e1", Buffer.from(e1, "base64")]]) });
    const old = v1.encrypt(code, "lic-1");

    const ring = new Map([
      ["e1", Buffer.from(e1, "base64")],
      ["e2", Buffer.from(e2, "base64")],
    ]);
    const v2 = new KeyRingSpellCodeVault(h, { activeId: "e2", keys: ring });
    expect(v2.decrypt({ ...old, licenseId: "lic-1" })).toBe(code);

    const moved = v2.reencrypt({ ...old, licenseId: "lic-1" });
    expect(moved.keyVersion).toBe("e2");
    expect(v2.decrypt({ ...moved, licenseId: "lic-1" })).toBe(code);

    // After retiring e1, only re-encrypted rows remain readable.
    const v2only = new KeyRingSpellCodeVault(h, { activeId: "e2", keys: new Map([["e2", Buffer.from(e2, "base64")]]) });
    expect(v2only.decrypt({ ...moved, licenseId: "lic-1" })).toBe(code);
    expect(() => v2only.decrypt({ ...old, licenseId: "lic-1" })).toThrow();
    // Idempotent on already-current rows.
    expect(v2.reencrypt({ ...moved, licenseId: "lic-1" }).keyVersion).toBe("e2");
  });

  it("supports HMAC-key rotation without stranding licenses", () => {
    const k1 = Buffer.from(randomKeyB64(), "base64");
    const k2 = Buffer.from(randomKeyB64(), "base64");
    const enc = cfg.codeEncryptionKeys;
    const before = new KeyRingSpellCodeVault({ activeId: "h1", keys: new Map([["h1", k1]]) }, enc);
    const stored = before.hashForStorage(code).hash;
    const after = new KeyRingSpellCodeVault(
      { activeId: "h2", keys: new Map([["h1", k1], ["h2", k2]]) },
      enc,
    );
    expect(after.lookupHashes(code)).toContain(stored);
    expect(after.hashForStorage(code).keyId).toBe("h2");
  });
});

describe("entitlement token (jose, EdDSA, kid rotation)", () => {
  const cfg = parseSpellConfig(makeSpellEnv());
  const issuer = new JoseSpellTokenIssuer(cfg.signing);
  const jwks = issuer.publicJwks();
  const base = {
    licenseId: "lic-1",
    activationId: "act-1",
    installationThumbprint: "thumb",
    planCode: SpellPlanCode.SPELL_3M,
    now,
    maxOfflineSeconds: 24 * HOUR,
    refreshIntervalSeconds: 12 * HOUR,
  };

  it("issues a token the client can verify offline with the published key", async () => {
    const issued = await issuer.issue({ ...base, licenseExpiresAt: new Date(now.getTime() + 30 * 86400_000) });
    expect(decodeProtectedHeader(issued.token)).toEqual({ alg: "EdDSA", kid: "k1", typ: SPELL_TOKEN_TYPE });
    const { payload, kid } = await verifySpellEntitlementToken(issued.token, jwks, now);
    expect(kid).toBe("k1");
    expect(payload).toMatchObject({
      iss: SPELL_TOKEN_ISSUER,
      aud: SPELL_TOKEN_AUDIENCE,
      sub: "lic-1",
      act: "act-1",
      inst: "thumb",
      plan: "SPELL_3M",
      ver: 1,
    });
    expect(payload.jti).toBe(issued.jti);
    expect(issued.validUntil.getTime() - now.getTime()).toBe(24 * HOUR * 1000);
    expect(issued.refreshAfter.getTime() - now.getTime()).toBe(12 * HOUR * 1000);
  });

  it("caps offline validity at the license expiry when that comes first", async () => {
    const expiresAt = new Date(now.getTime() + 3 * HOUR * 1000);
    const issued = await issuer.issue({ ...base, licenseExpiresAt: expiresAt });
    expect(issued.validUntil.getTime()).toBe(expiresAt.getTime());
    expect(issued.refreshAfter.getTime()).toBeLessThanOrEqual(issued.validUntil.getTime());
  });

  it("expires exactly at validUntil (no offline use past the hard limit)", async () => {
    const issued = await issuer.issue({ ...base, licenseExpiresAt: new Date(now.getTime() + 30 * 86400_000) });
    await expect(
      verifySpellEntitlementToken(issued.token, jwks, new Date(issued.validUntil.getTime() - 1000)),
    ).resolves.toBeTruthy();
    await expect(
      verifySpellEntitlementToken(issued.token, jwks, new Date(issued.validUntil.getTime() + 1000)),
    ).rejects.toThrow();
  });

  it("rejects tampering, wrong keys, wrong audience/issuer/type, and alg confusion", async () => {
    const issued = await issuer.issue({ ...base, licenseExpiresAt: new Date(now.getTime() + 86400_000 * 30) });
    const [h, p, s] = issued.token.split(".");

    // Tampered payload.
    const forgedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p!, "base64url").toString()), plan: "SPELL_12M" })).toString("base64url");
    await expect(verifySpellEntitlementToken(`${h}.${forgedPayload}.${s}`, jwks, now)).rejects.toThrow();

    // Signed by an attacker's own key but claiming our kid.
    const attacker = generateKeyPairSync("ed25519").privateKey;
    const evil = await new SignJWT({ act: "x", inst: "x", plan: "SPELL_12M", lic_exp: 9999999999, refresh_after: 1, ver: 1 })
      .setProtectedHeader({ alg: "EdDSA", kid: "k1", typ: SPELL_TOKEN_TYPE })
      .setIssuer(SPELL_TOKEN_ISSUER).setAudience(SPELL_TOKEN_AUDIENCE).setSubject("lic-1").setJti("j")
      .setIssuedAt(Math.floor(now.getTime() / 1000)).setExpirationTime(Math.floor(now.getTime() / 1000) + 3600)
      .sign(attacker);
    await expect(verifySpellEntitlementToken(evil, jwks, now)).rejects.toThrow();

    // Unknown kid.
    const other = new JoseSpellTokenIssuer(parseSpellConfig(makeSpellEnv({ SPELL_SIGNING_ACTIVE_KID: "k1" })).signing);
    const foreign = await other.issue({ ...base, licenseExpiresAt: new Date(now.getTime() + 86400_000) });
    await expect(verifySpellEntitlementToken(foreign.token, jwks, now)).rejects.toThrow();

    // alg=none and HS256 (symmetric confusion using the public key as secret).
    const none = new UnsecuredJWT({ act: "x" }).setIssuer(SPELL_TOKEN_ISSUER).setAudience(SPELL_TOKEN_AUDIENCE).setSubject("lic-1").setExpirationTime("1h").encode();
    await expect(verifySpellEntitlementToken(none, jwks, now)).rejects.toThrow();
    const hs = await new SignJWT({}).setProtectedHeader({ alg: "HS256", kid: "k1", typ: SPELL_TOKEN_TYPE })
      .setIssuer(SPELL_TOKEN_ISSUER).setAudience(SPELL_TOKEN_AUDIENCE).setSubject("lic-1").setJti("j").setIssuedAt().setExpirationTime("1h")
      .sign(Buffer.from((jwks.keys[0] as { x: string }).x, "base64url"));
    await expect(verifySpellEntitlementToken(hs, jwks, now)).rejects.toThrow();

    // Wrong audience / wrong typ.
    const wrongAud = await new SignJWT({}).setProtectedHeader({ alg: "EdDSA", kid: "k1", typ: SPELL_TOKEN_TYPE })
      .setIssuer(SPELL_TOKEN_ISSUER).setAudience("someone-else").setSubject("l").setJti("j").setIssuedAt(Math.floor(now.getTime() / 1000)).setExpirationTime(Math.floor(now.getTime() / 1000) + 600)
      .sign(generateKeyPairSync("ed25519").privateKey);
    await expect(verifySpellEntitlementToken(wrongAud, jwks, now)).rejects.toThrow();
  });

  it("rotates signing keys by kid: both generations verify while both are published", async () => {
    const k1 = signingKeyB64();
    const k2 = signingKeyB64();
    const oldEnv = makeSpellEnv({ SPELL_SIGNING_KEYS: `k1:${k1}`, SPELL_SIGNING_ACTIVE_KID: "k1" });
    const rotatedEnv = makeSpellEnv({ SPELL_SIGNING_KEYS: `k1:${k1},k2:${k2}`, SPELL_SIGNING_ACTIVE_KID: "k2" });
    const oldIssuer = new JoseSpellTokenIssuer(parseSpellConfig(oldEnv).signing);
    const newIssuer = new JoseSpellTokenIssuer(parseSpellConfig(rotatedEnv).signing);
    const exp = new Date(now.getTime() + 86400_000 * 30);
    const oldToken = await oldIssuer.issue({ ...base, licenseExpiresAt: exp });
    const newToken = await newIssuer.issue({ ...base, licenseExpiresAt: exp });

    const published = newIssuer.publicJwks();
    expect(published.keys.map((k) => k.kid).sort()).toEqual(["k1", "k2"]);
    expect((await verifySpellEntitlementToken(oldToken.token, published, now)).kid).toBe("k1");
    expect((await verifySpellEntitlementToken(newToken.token, published, now)).kid).toBe("k2");
    expect(JSON.stringify(published)).not.toContain("\"d\"");
    // After k1 is retired from the published set, its tokens stop verifying.
    await expect(
      verifySpellEntitlementToken(oldToken.token, { keys: published.keys.filter((k) => k.kid === "k2") }, now),
    ).rejects.toThrow();
  });
});

describe("device identity & signed requests", () => {
  it("derives the thumbprint from the raw key and rejects malformed keys", () => {
    const d = newDevice();
    expect(parseRawEd25519PublicKey(d.publicKey)).not.toBeNull();
    expect(computeKeyThumbprint(Buffer.from(d.publicKey, "base64url"))).toBe(d.thumbprint);
    for (const bad of ["", "abc", "A".repeat(43) + "=", "!!!", Buffer.alloc(31).toString("base64url"), Buffer.alloc(33).toString("base64url"), null, 5]) {
      expect(parseRawEd25519PublicKey(bad)).toBeNull();
    }
  });

  it("verifies only signatures over the exact canonical request", () => {
    const d = newDevice();
    const req = signRequest(d, { path: "/api/spell/v1/validations", body: { activationId: "x" }, now });
    const message = buildCanonicalRequest({ method: "POST", path: req.path, timestamp: req.headers.timestamp!, nonce: req.headers.nonce!, rawBody: req.rawBody });
    const sig = req.headers.signature!;
    expect(verifyEd25519Signature({ publicKey: d.publicKey, message, signature: sig })).toBe(true);
    for (const mutated of [
      buildCanonicalRequest({ method: "GET", path: req.path, timestamp: req.headers.timestamp!, nonce: req.headers.nonce!, rawBody: req.rawBody }),
      buildCanonicalRequest({ method: "POST", path: "/api/spell/v1/activations", timestamp: req.headers.timestamp!, nonce: req.headers.nonce!, rawBody: req.rawBody }),
      buildCanonicalRequest({ method: "POST", path: req.path, timestamp: "1", nonce: req.headers.nonce!, rawBody: req.rawBody }),
      buildCanonicalRequest({ method: "POST", path: req.path, timestamp: req.headers.timestamp!, nonce: "other-nonce-value-1234", rawBody: req.rawBody }),
      buildCanonicalRequest({ method: "POST", path: req.path, timestamp: req.headers.timestamp!, nonce: req.headers.nonce!, rawBody: "{}" }),
    ]) {
      expect(verifyEd25519Signature({ publicKey: d.publicKey, message: mutated, signature: sig })).toBe(false);
    }
    expect(verifyEd25519Signature({ publicKey: newDevice().publicKey, message, signature: sig })).toBe(false);
    expect(verifyEd25519Signature({ publicKey: d.publicKey, message, signature: "short" })).toBe(false);
    expect(verifyEd25519Signature({ publicKey: d.publicKey, message, signature: Buffer.alloc(64).toString("base64url") })).toBe(false);
    void randomBytes; void nodeSign;
  });
});
