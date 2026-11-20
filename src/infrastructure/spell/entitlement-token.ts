import { randomUUID, createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";

import {
  SignJWT,
  createLocalJWKSet,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
} from "jose";

import type {
  IssuedSpellToken,
  SpellTokenClaimsInput,
  SpellTokenIssuer,
} from "@/domain/ports/spell-security";
import { SPELL_RELEASE_TOKEN_TTL_SECONDS, SPELL_RELEASE_TOKEN_TYPE, type SpellRelease } from "@/domain/spell/update";
import type { SigningKeyRing } from "./spell-config";

export const SPELL_TOKEN_ISSUER = "tore-spell";
export const SPELL_TOKEN_AUDIENCE = "tore-spell-desktop";
export const SPELL_TOKEN_TYPE = "tore-spell+jwt";
/** The only algorithm ever signed or accepted. Never derived from a header. */
export const SPELL_TOKEN_ALG = "EdDSA";

export type SpellEntitlementClaims = JWTPayload & {
  /** activation id */
  act: string;
  /** installation key thumbprint */
  inst: string;
  plan: string;
  /** license expiry, epoch seconds */
  lic_exp: number;
  /** soft refresh deadline, epoch seconds */
  refresh_after: number;
  ver: 1;
};

/**
 * Signs entitlement tokens with `jose` (EdDSA / Ed25519, `kid` header).
 * `exp` is the HARD offline limit: min(license expiry, now + max offline).
 * Rotation: add a new key to the ring, switch the active kid, publish both
 * public keys; retire the old key once tokens signed with it have expired.
 */
export class JoseSpellTokenIssuer implements SpellTokenIssuer {
  private readonly privateKeys = new Map<string, KeyObject>();

  constructor(private readonly ring: SigningKeyRing) {
    for (const [kid, der] of ring.keys) {
      this.privateKeys.set(
        kid,
        createPrivateKey({ key: der, format: "der", type: "pkcs8" }),
      );
    }
  }

  /** Public JWKS for every key in the ring (clients verify by `kid`). */
  publicJwks(): JSONWebKeySet {
    return {
      keys: [...this.privateKeys].map(([kid, priv]) => {
        const jwk = createPublicKey(priv).export({ format: "jwk" });
        return { ...jwk, kid, alg: SPELL_TOKEN_ALG, use: "sig" };
      }),
    };
  }

  /**
   * Signs the latest-release description for the desktop updater (typ `tore-spell-release+jwt`). Short-lived: a captured document cannot
   * advertise an old release forever. The app verifies it with the public keys compiled into it.
   */
  async signRelease(release: SpellRelease, now: Date): Promise<string> {
    const kid = this.ring.activeKid;
    const key = this.privateKeys.get(kid);
    if (!key) throw new Error("Spell signing key is not available");
    const iat = Math.floor(now.getTime() / 1000);
    return new SignJWT({ rel: release.version, url: release.url, sha256: release.sha256, size: release.size, min: release.minSupportedVersion })
      .setProtectedHeader({ alg: SPELL_TOKEN_ALG, kid, typ: SPELL_RELEASE_TOKEN_TYPE })
      .setIssuer(SPELL_TOKEN_ISSUER)
      .setAudience(SPELL_TOKEN_AUDIENCE)
      .setIssuedAt(iat)
      .setExpirationTime(iat + SPELL_RELEASE_TOKEN_TTL_SECONDS)
      .sign(key);
  }

  async issue(input: SpellTokenClaimsInput): Promise<IssuedSpellToken> {
    const kid = this.ring.activeKid;
    const key = this.privateKeys.get(kid);
    if (!key) throw new Error("Spell signing key is not available");

    const iat = Math.floor(input.now.getTime() / 1000);
    const licenseExp = Math.floor(input.licenseExpiresAt.getTime() / 1000);
    const exp = Math.min(licenseExp, iat + input.maxOfflineSeconds);
    const refreshAfter = Math.min(iat + input.refreshIntervalSeconds, exp);
    const jti = randomUUID();

    const claims: Omit<SpellEntitlementClaims, keyof JWTPayload> = {
      act: input.activationId,
      inst: input.installationThumbprint,
      plan: input.planCode,
      lic_exp: licenseExp,
      refresh_after: refreshAfter,
      ver: 1,
    };
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: SPELL_TOKEN_ALG, kid, typ: SPELL_TOKEN_TYPE })
      .setIssuer(SPELL_TOKEN_ISSUER)
      .setAudience(SPELL_TOKEN_AUDIENCE)
      .setSubject(input.licenseId)
      .setJti(jti)
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(key);

    return {
      token,
      jti,
      keyId: kid,
      issuedAt: new Date(iat * 1000),
      validUntil: new Date(exp * 1000),
      refreshAfter: new Date(refreshAfter * 1000),
    };
  }
}

/**
 * Reference verifier (what the desktop client does locally, and what tests
 * use). Pins the algorithm, issuer, audience and `typ`; resolves the key by
 * `kid` from the supplied public key set only.
 */
export async function verifySpellEntitlementToken(
  token: string,
  jwks: JSONWebKeySet,
  now: Date = new Date(),
): Promise<{ payload: SpellEntitlementClaims; kid: string }> {
  const { payload, protectedHeader } = await jwtVerify(
    token,
    createLocalJWKSet(jwks),
    {
      algorithms: [SPELL_TOKEN_ALG],
      issuer: SPELL_TOKEN_ISSUER,
      audience: SPELL_TOKEN_AUDIENCE,
      typ: SPELL_TOKEN_TYPE,
      currentDate: now,
      requiredClaims: ["exp", "iat", "jti", "sub"],
    },
  );
  return {
    payload: payload as SpellEntitlementClaims,
    kid: protectedHeader.kid ?? "",
  };
}
