import { describe, expect, it } from "vitest";

import {
  ALL_SITE_CONTENT_DEFINITIONS,
  applySiteContentOverrides,
  getSiteContentDefault,
  getSiteContentDefinition,
  validateSiteContentValue,
} from "@/domain/site-content/registry";
import { SITE_CONTENT_DEFINITIONS, getAvailableSiteContentDefinition } from "@/application/use-cases/site-content/catalog";
import { getDictionarySync } from "@/i18n/get-dictionary-sync";

const tagline = getSiteContentDefinition("home.hero.tagline")!;
const body = getSiteContentDefinition("home.intro.body")!;

/** Anything that decides money, rights, access, security or legal position must never be reachable through the content editor. */
const BANNED = /price|pricing|plan|billing|payment|licen[cs]e|entitle|auth|login|password|terms|privacy|disclaimer|consent|security|checkout|subscription|unsigned|qpay|invoice/i;
const ALLOWED_PATH_PREFIXES = [
  "publicHome.",
  "landing.market",
  "landing.faq",
  "meta.",
  "spell.hero.",
  "spell.meta.",
  "spell.features.",
  "spell.download.cta",
  "spell.download.note",
  "spell.download.requirements",
  "spell.steps.",
];

describe("site content registry integrity", () => {
  it("has unique, stable keys, each in the form <page>.<section>…", () => {
    const keys = ALL_SITE_CONTENT_DEFINITIONS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const d of ALL_SITE_CONTENT_DEFINITIONS) expect(d.key.startsWith(`${d.page}.`), d.key).toBe(true);
  });

  it("keeps the phase-1 keys that render (home.products.eyebrow was removed: no page ever displayed it)", () => {
    const phase1 = [
      "home.hero.brandLine", "home.hero.tagline", "home.hero.chatTitle", "home.hero.chatSubtitle", "home.intro.title", "home.intro.body",
      "home.products.citizen.description", "home.products.student.description", "home.products.lawyer.description",
      "home.products.firm.description", "home.products.team.description",
    ];
    for (const key of phase1) expect(getAvailableSiteContentDefinition(key), key).toBeDefined();
  });

  it("every AVAILABLE key has mn and en defaults that already pass validation (existing copy is preserved, never rewritten)", () => {
    expect(SITE_CONTENT_DEFINITIONS.length).toBeGreaterThan(50);
    for (const definition of SITE_CONTENT_DEFINITIONS) {
      for (const locale of ["mn", "en"] as const) {
        const value = getSiteContentDefault(getDictionarySync(locale), definition);
        expect(value, `${definition.key} (${locale})`).toBeTypeOf("string");
        const checked = validateSiteContentValue(definition, value);
        expect(checked.ok, `${definition.key} (${locale}) default must be valid: ${JSON.stringify(checked)}`).toBe(true);
      }
    }
  });

  it("every registered key is either fully available or fully absent in this build (no half-present surface)", () => {
    for (const page of new Set(ALL_SITE_CONTENT_DEFINITIONS.map((d) => d.page))) {
      const all = ALL_SITE_CONTENT_DEFINITIONS.filter((d) => d.page === page);
      const available = all.filter((d) => getAvailableSiteContentDefinition(d.key));
      expect([0, all.length], `${page}: ${available.length}/${all.length} available`).toContain(available.length);
    }
  });

  it("only exposes presentation copy: nothing about prices, billing, payment, licences, access, security or legal text", () => {
    for (const definition of ALL_SITE_CONTENT_DEFINITIONS) {
      expect(`${definition.key} ${definition.dictionaryPath}`, definition.key).not.toMatch(BANNED);
      expect(ALLOWED_PATH_PREFIXES.some((prefix) => definition.dictionaryPath.startsWith(prefix)), `${definition.key} -> ${definition.dictionaryPath}`).toBe(true);
      expect(definition.kind).toBe("editorial");
    }
  });

  it("never offers a placeholder-bearing string (e.g. {price}) or legal-liability wording field", () => {
    for (const definition of SITE_CONTENT_DEFINITIONS) {
      for (const locale of ["mn", "en"] as const) {
        expect(getSiteContentDefault(getDictionarySync(locale), definition), definition.key).not.toMatch(/\{[a-zA-Z]+\}/);
      }
    }
  });

  it("a removed key is refused by editing code", () => {
    expect(getAvailableSiteContentDefinition("home.products.eyebrow")).toBeUndefined();
  });

  it("unknown or unavailable keys resolve to nothing for editing code", () => {
    for (const key of ["", "__proto__", "billing.price", "spell.pricing.note", "spell.download.unsigned", "publicHome.tagline"]) {
      expect(getAvailableSiteContentDefinition(key), key).toBeUndefined();
    }
  });

  it("metadata keys carry their role and sensible limits", () => {
    expect(getSiteContentDefinition("shared.meta.title")).toMatchObject({ role: "metaTitle", maxLength: 70 });
    expect(getSiteContentDefinition("shared.meta.description")).toMatchObject({ role: "metaDescription", maxLength: 160 });
  });
});

describe("editor guidance", () => {
  it("the tagline key tells editors the footer and browser title are NOT covered", () => {
    expect(tagline.note?.mn).toMatch(/Хөл хэсгийн/);
    expect(tagline.note?.en).toMatch(/footer/i);
  });
});

describe("validation (plain text only)", () => {
  it("accepts ordinary Mongolian and English text and trims it", () => {
    expect(validateSiteContentValue(tagline, "  Хуулийг ойлгож, шийдлийг бүтээ.  ")).toEqual({ ok: true, value: "Хуулийг ойлгож, шийдлийг бүтээ." });
    expect(validateSiteContentValue(tagline, "Understand the law.")).toEqual({ ok: true, value: "Understand the law." });
  });

  it.each([
    ["script tag", "<script>alert(1)</script>"],
    ["img onerror", '<img src=x onerror="alert(1)">'],
    ["any angle bracket", "a < b"],
    ["closing bracket only", "x>"],
  ])("rejects markup: %s", (_name, value) => {
    const result = validateSiteContentValue(body, value);
    expect(result.ok).toBe(false);
  });

  it("rejects empty, whitespace-only, over-long, control characters and non-strings", () => {
    expect(validateSiteContentValue(tagline, "").ok).toBe(false);
    expect(validateSiteContentValue(tagline, "   ").ok).toBe(false);
    expect(validateSiteContentValue(tagline, "x".repeat(tagline.maxLength + 1)).ok).toBe(false);
    expect(validateSiteContentValue(tagline, "bad\u0000value").ok).toBe(false);
    expect(validateSiteContentValue(tagline, "bad\u001bvalue").ok).toBe(false);
    expect(validateSiteContentValue(tagline, 42).ok).toBe(false);
    expect(validateSiteContentValue(tagline, null).ok).toBe(false);
  });

  it("allows line breaks only where the field is multi-line", () => {
    expect(validateSiteContentValue(tagline, "a\nb").ok).toBe(false);
    expect(validateSiteContentValue(body, "a\r\nb")).toEqual({ ok: true, value: "a\nb" });
  });

  it("treats a javascript: URL as inert text (nothing here ever becomes a link or markup)", () => {
    expect(validateSiteContentValue(tagline, "javascript:alert(1)")).toEqual({ ok: true, value: "javascript:alert(1)" });
  });
});

describe("applying overrides", () => {
  const mn = getDictionarySync("mn");

  it("replaces only the registered path and never mutates the source dictionary", () => {
    const before = JSON.stringify(mn);
    const out = applySiteContentOverrides(mn, { "home.hero.tagline": "Шинэ уриа" });
    expect(out.publicHome.tagline).toBe("Шинэ уриа");
    expect(out.publicHome.introTitle).toBe(mn.publicHome.introTitle);
    expect(out.publicHome.products.lawyer.description).toBe(mn.publicHome.products.lawyer.description);
    expect(JSON.stringify(mn)).toBe(before);
    expect(mn.publicHome.tagline).not.toBe("Шинэ уриа");
  });

  it("supports nested product descriptions without touching price-like or sibling fields", () => {
    const out = applySiteContentOverrides(mn, { "home.products.lawyer.description": "Шинэ тайлбар" });
    expect(out.publicHome.products.lawyer.description).toBe("Шинэ тайлбар");
    expect(out.publicHome.products.lawyer.cta).toBe(mn.publicHome.products.lawyer.cta);
    expect(out.publicHome.products.citizen.description).toBe(mn.publicHome.products.citizen.description);
  });

  it("ignores unknown keys, keys outside the allowlist, and stored values that no longer validate", () => {
    const out = applySiteContentOverrides(mn, {
      "nope.unknown": "x",
      "auth.signIn": "hacked",
      "home.hero.tagline": "<script>alert(1)</script>",
      "home.intro.title": "",
    });
    expect(out).toEqual(mn);
  });

  it("keeps mn and en separate: an override applied to one dictionary leaves the other untouched", () => {
    const en = getDictionarySync("en");
    const mnOut = applySiteContentOverrides(mn, { "home.hero.tagline": "Зөвхөн Монгол" });
    expect(mnOut.publicHome.tagline).toBe("Зөвхөн Монгол");
    expect(en.publicHome.tagline).toBe("Understand the law, build the solution.");
    const enOut = applySiteContentOverrides(en, { "home.hero.tagline": "English only" });
    expect(enOut.publicHome.tagline).toBe("English only");
    expect(mnOut.publicHome.tagline).toBe("Зөвхөн Монгол");
  });

  it("returns an equal copy when there is nothing to apply", () => {
    expect(applySiteContentOverrides(mn, {})).toEqual(mn);
  });
});
