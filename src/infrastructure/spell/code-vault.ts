import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

import type { SpellCodeVault } from "@/domain/ports/spell-security";
import type { SymmetricKeyRing } from "./spell-config";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function requireKey(ring: SymmetricKeyRing, id: string): Buffer {
  const key = ring.keys.get(id);
  if (!key) {
    // Deliberately generic: never echo ids or values from stored data.
    throw new Error("Spell key is not available");
  }
  return key;
}

/**
 * Key-rotatable protection for license codes.
 *
 *  - Lookup: HMAC-SHA256 under a server key, domain-separated. Because every
 *    configured key is tried on lookup, adding a new active key never strands
 *    licenses hashed under an older one.
 *  - Owner reveal: AES-256-GCM. The row's `codeEncKeyVersion` records which
 *    key encrypted it, and the licence id plus key version are bound as AAD,
 *    so ciphertext cannot be moved between rows or relabelled.
 *    Layout: iv(12) || tag(16) || ciphertext.
 */
export class KeyRingSpellCodeVault implements SpellCodeVault {
  constructor(
    private readonly hmacKeys: SymmetricKeyRing,
    private readonly encryptionKeys: SymmetricKeyRing,
  ) {}

  private hmac(keyId: string, label: string, value: string): string {
    return createHmac("sha256", requireKey(this.hmacKeys, keyId))
      .update(`tore-spell:${label}:v1:`)
      .update(value)
      .digest("hex");
  }

  hashForStorage(canonicalCode: string) {
    const keyId = this.hmacKeys.activeId;
    return { hash: this.hmac(keyId, "license-code", canonicalCode), keyId };
  }

  lookupHashes(canonicalCode: string): string[] {
    return [...this.hmacKeys.keys.keys()].map((id) =>
      this.hmac(id, "license-code", canonicalCode),
    );
  }

  private aad(licenseId: string, keyVersion: string): Buffer {
    return Buffer.from(`tore-spell:code-enc:v1:${licenseId}:${keyVersion}`, "utf8");
  }

  encrypt(canonicalCode: string, licenseId: string) {
    const keyVersion = this.encryptionKeys.activeId;
    const key = requireKey(this.encryptionKeys, keyVersion);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(this.aad(licenseId, keyVersion));
    const body = Buffer.concat([
      cipher.update(canonicalCode, "utf8"),
      cipher.final(),
    ]);
    const ciphertext = Buffer.concat([iv, cipher.getAuthTag(), body]);
    return { ciphertext, keyVersion };
  }

  decrypt(input: {
    ciphertext: Uint8Array;
    keyVersion: string;
    licenseId: string;
  }): string {
    const data = Buffer.from(input.ciphertext);
    if (data.length <= IV_LENGTH + TAG_LENGTH) {
      throw new Error("Spell ciphertext is malformed");
    }
    const key = requireKey(this.encryptionKeys, input.keyVersion);
    const iv = data.subarray(0, IV_LENGTH);
    const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const body = data.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(this.aad(input.licenseId, input.keyVersion));
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
    } catch {
      throw new Error("Spell ciphertext could not be authenticated");
    }
  }

  /** Re-encrypt under the active key (rotation). Safe to run repeatedly. */
  reencrypt(input: {
    ciphertext: Uint8Array;
    keyVersion: string;
    licenseId: string;
  }): { ciphertext: Uint8Array; keyVersion: string } {
    if (input.keyVersion === this.encryptionKeys.activeId) {
      return { ciphertext: input.ciphertext, keyVersion: input.keyVersion };
    }
    return this.encrypt(this.decrypt(input), input.licenseId);
  }

  hashIdentifier(label: "machine-hint" | "client-ip", value: string): string {
    return this.hmac(this.hmacKeys.activeId, label, value);
  }
}
