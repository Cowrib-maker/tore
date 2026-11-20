/**
 * License code format: `TSPL-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`.
 *
 * 24 Crockford-base32 characters: 23 random payload characters (115 bits of
 * entropy) plus one Luhn-mod-32 check character. The check character lets
 * clients catch typos offline; it is NOT a security control — the entropy is.
 * The `TSPL` prefix is cosmetic and optional on input.
 */

export const LICENSE_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const LICENSE_CODE_PREFIX = "TSPL";
export const LICENSE_CODE_PAYLOAD_LENGTH = 23;
export const LICENSE_CODE_LENGTH = LICENSE_CODE_PAYLOAD_LENGTH + 1;

const N = LICENSE_CODE_ALPHABET.length; // 32

function indexOf(char: string): number {
  return LICENSE_CODE_ALPHABET.indexOf(char);
}

/** Luhn mod-N check character for a payload made of alphabet characters. */
export function computeCheckCharacter(payload: string): string {
  let factor = 2;
  let sum = 0;
  for (let i = payload.length - 1; i >= 0; i--) {
    const codePoint = indexOf(payload[i]!);
    if (codePoint < 0) {
      throw new Error("Invalid license code character");
    }
    let addend = factor * codePoint;
    factor = factor === 2 ? 1 : 2;
    addend = Math.floor(addend / N) + (addend % N);
    sum += addend;
  }
  const remainder = sum % N;
  return LICENSE_CODE_ALPHABET[(N - remainder) % N]!;
}

/**
 * Build a canonical (24 char, no separators) code from random bytes.
 * `byte & 31` is unbiased because the alphabet size divides 256.
 */
export function generateCanonicalLicenseCode(
  randomBytes: (size: number) => Uint8Array,
): string {
  const bytes = randomBytes(LICENSE_CODE_PAYLOAD_LENGTH);
  if (bytes.length < LICENSE_CODE_PAYLOAD_LENGTH) {
    throw new Error("Random source returned too few bytes");
  }
  let payload = "";
  for (let i = 0; i < LICENSE_CODE_PAYLOAD_LENGTH; i++) {
    payload += LICENSE_CODE_ALPHABET[bytes[i]! & 31];
  }
  return payload + computeCheckCharacter(payload);
}

/** `TSPL-XXXX-XXXX-...` for display. */
export function formatLicenseCode(canonical: string): string {
  const groups = canonical.match(/.{1,4}/g) ?? [];
  return [LICENSE_CODE_PREFIX, ...groups].join("-");
}

/** What the UI may show without revealing the code. */
export function licenseCodeHint(canonical: string): string {
  return canonical.slice(-4);
}

export function maskedLicenseCode(hint: string): string {
  const masked = Array.from({ length: LICENSE_CODE_LENGTH / 4 - 1 }, () => "••••");
  return [LICENSE_CODE_PREFIX, ...masked, hint].join("-");
}

export type NormalizedLicenseCode =
  | { ok: true; canonical: string }
  | { ok: false };

/**
 * Normalise user input to the canonical form and verify the check character.
 * Crockford substitutions: I/L → 1, O → 0. `U` is not in the alphabet.
 * Never throws and never echoes the input.
 */
export function normalizeLicenseCode(input: unknown): NormalizedLicenseCode {
  if (typeof input !== "string" || input.length > 64) {
    return { ok: false };
  }
  let value = input.toUpperCase().replace(/[\s-]/g, "");
  // Strip the prefix BEFORE look-alike substitution: "TSPL" contains an L.
  if (
    value.length === LICENSE_CODE_LENGTH + LICENSE_CODE_PREFIX.length &&
    value.startsWith(LICENSE_CODE_PREFIX)
  ) {
    value = value.slice(LICENSE_CODE_PREFIX.length);
  }
  value = value.replace(/[IL]/g, "1").replace(/O/g, "0");
  if (value.length !== LICENSE_CODE_LENGTH) {
    return { ok: false };
  }
  for (const char of value) {
    if (indexOf(char) < 0) return { ok: false };
  }
  const payload = value.slice(0, -1);
  if (computeCheckCharacter(payload) !== value.slice(-1)) {
    return { ok: false };
  }
  return { ok: true, canonical: value };
}
