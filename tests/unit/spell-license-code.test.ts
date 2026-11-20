import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  LICENSE_CODE_ALPHABET,
  LICENSE_CODE_LENGTH,
  computeCheckCharacter,
  formatLicenseCode,
  generateCanonicalLicenseCode,
  licenseCodeHint,
  maskedLicenseCode,
  normalizeLicenseCode,
} from "@/domain/spell/license-code";

const gen = () => generateCanonicalLicenseCode((n) => randomBytes(n));

describe("license code", () => {
  it("generates 24 alphabet characters with a valid check character", () => {
    for (let i = 0; i < 200; i++) {
      const code = gen();
      expect(code).toHaveLength(LICENSE_CODE_LENGTH);
      expect([...code].every((c) => LICENSE_CODE_ALPHABET.includes(c))).toBe(true);
      expect(computeCheckCharacter(code.slice(0, -1))).toBe(code.slice(-1));
    }
  });

  it("is unbiased-looking and unique across many draws", () => {
    const seen = new Set<string>();
    const freq = new Map<string, number>();
    for (let i = 0; i < 2000; i++) {
      const code = gen();
      seen.add(code);
      for (const c of code.slice(0, -1)) freq.set(c, (freq.get(c) ?? 0) + 1);
    }
    expect(seen.size).toBe(2000);
    expect(freq.size).toBe(32);
  });

  it("rejects a random source that is too short", () => {
    expect(() => generateCanonicalLicenseCode(() => new Uint8Array(3))).toThrow();
  });

  it("round-trips through the display format", () => {
    const code = gen();
    const shown = formatLicenseCode(code);
    expect(shown).toMatch(/^TSPL(-[0-9A-Z]{4}){6}$/);
    expect(normalizeLicenseCode(shown)).toEqual({ ok: true, canonical: code });
  });

  it("normalises case, spaces, hyphens, optional prefix and Crockford look-alikes", () => {
    const code = gen();
    const shown = formatLicenseCode(code);
    for (const variant of [
      shown.toLowerCase(),
      shown.replaceAll("-", " "),
      shown.replace(/^TSPL-/, ""),
      `  ${shown}  `,
      code,
    ]) {
      expect(normalizeLicenseCode(variant)).toEqual({ ok: true, canonical: code });
    }
    // I/L → 1, O → 0, but only when the result still has a valid checksum.
    const withOneAndZero = "0123456789ABCDEFGHJKMNP".slice(0, 23);
    const check = computeCheckCharacter(withOneAndZero);
    const canonical = withOneAndZero + check;
    const typed = canonical.replace("0", "O").replace("1", "l");
    expect(normalizeLicenseCode(typed)).toEqual({ ok: true, canonical });
  });

  it("detects every single-character substitution", () => {
    const code = gen();
    for (let i = 0; i < code.length; i++) {
      for (const c of LICENSE_CODE_ALPHABET) {
        if (c === code[i]) continue;
        const mutated = code.slice(0, i) + c + code.slice(i + 1);
        expect(normalizeLicenseCode(mutated).ok).toBe(false);
      }
    }
  });

  it("rejects wrong lengths, foreign characters, U, and non-strings without throwing", () => {
    const code = gen();
    const bad: unknown[] = [
      "",
      "TSPL",
      code.slice(1),
      code + "0",
      code.slice(0, -1) + "U",
      "!@#$".repeat(8),
      "x".repeat(500),
      null,
      undefined,
      42,
      {},
      ["a"],
    ];
    for (const value of bad) expect(normalizeLicenseCode(value)).toEqual({ ok: false });
  });

  it("exposes only the last four characters as a hint", () => {
    const code = gen();
    expect(licenseCodeHint(code)).toBe(code.slice(-4));
    const masked = maskedLicenseCode(licenseCodeHint(code));
    expect(masked).toBe(`TSPL-••••-••••-••••-••••-••••-${code.slice(-4)}`);
    expect(masked).not.toContain(code.slice(0, 8));
  });
});
