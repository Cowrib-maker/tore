import { sha256Hex } from "./hash";

/**
 * Observed LegalInfo.mn dynamic noise: feedback captcha cache-buster.
 * Example: `api/captcha?x=1787404746728368`
 *
 * This is the only substitution. Legal text, dates, headings, and articles
 * are not stripped or rewritten.
 */
export const LEGALINFO_CAPTCHA_NONCE_PATTERN = /api\/captcha\?x=\d+/gi;
export const LEGALINFO_CAPTCHA_STABLE = "api/captcha?x=";

/**
 * Deterministic legal-source bytes: raw HTML with known non-legal captcha
 * cache-busters neutralized. Does not collapse whitespace or drop sections.
 */
export function canonicalizeLegalSourceBytes(bytes: Uint8Array): Uint8Array {
  const text = new TextDecoder("utf-8").decode(bytes);
  const canonical = text.replace(
    LEGALINFO_CAPTCHA_NONCE_PATTERN,
    LEGALINFO_CAPTCHA_STABLE,
  );
  return new TextEncoder().encode(canonical);
}

/** SHA-256 of exact received bytes (archive blob integrity). */
export function rawSha256Hex(bytes: Uint8Array): string {
  return sha256Hex(bytes);
}

/** SHA-256 of canonical legal source bytes (knowledge identity / dedup). */
export function contentSha256Hex(bytes: Uint8Array): string {
  return sha256Hex(canonicalizeLegalSourceBytes(bytes));
}
