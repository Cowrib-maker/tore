import type { SpellPlanCode } from "@/domain/spell/enums";

/** Hashing and reversible encryption of license codes (keys live in infra). */
export interface SpellCodeVault {
  /** Hash + the key id that produced it, for storing a new license. */
  hashForStorage(canonicalCode: string): { hash: string; keyId: string };
  /** One hash per configured key, so rotation never strands a license. */
  lookupHashes(canonicalCode: string): string[];
  encrypt(
    canonicalCode: string,
    licenseId: string,
  ): { ciphertext: Uint8Array; keyVersion: string };
  decrypt(input: {
    ciphertext: Uint8Array;
    keyVersion: string;
    licenseId: string;
  }): string;
  /** Keyed, domain-separated digest of a low-sensitivity identifier. */
  hashIdentifier(label: "machine-hint" | "client-ip", value: string): string;
}

export type SpellTokenClaimsInput = {
  licenseId: string;
  activationId: string;
  installationThumbprint: string;
  planCode: SpellPlanCode;
  licenseExpiresAt: Date;
  now: Date;
  maxOfflineSeconds: number;
  refreshIntervalSeconds: number;
};

export type IssuedSpellToken = {
  token: string;
  jti: string;
  keyId: string;
  issuedAt: Date;
  /** Hard offline limit: min(license expiry, issuedAt + maxOffline). */
  validUntil: Date;
  /** Client should contact the server again at or before this time. */
  refreshAfter: Date;
};

export interface SpellTokenIssuer {
  issue(input: SpellTokenClaimsInput): Promise<IssuedSpellToken>;
}
