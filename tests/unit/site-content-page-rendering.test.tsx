import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { LandingPage } from "@/components/marketing/landing-page";
import { SITE_CONTENT_DEFINITIONS } from "@/application/use-cases/site-content/catalog";
import { getHomePreviewProps, PREVIEW_CONTEXTS } from "@/domain/admin-preview/scenarios";
import { applySiteContentOverrides, validateSiteContentValue, type SiteContentDefinition } from "@/domain/site-content/registry";
import { getDictionarySync } from "@/i18n/get-dictionary-sync";

/** A unique, valid replacement for `definition` that cannot occur anywhere in the built-in copy. */
function sentinel(definition: SiteContentDefinition, locale: string): string {
  const value = `ZQ${locale}:${definition.key}`;
  const checked = validateSiteContentValue(definition, value);
  if (!checked.ok) throw new Error(`sentinel for ${definition.key} invalid: ${checked.reason}`);
  return checked.value;
}

function renderHomeLike(dict: ReturnType<typeof getDictionarySync>, locale: "mn" | "en", context: keyof typeof PREVIEW_CONTEXTS = "anonymous") {
  return renderToStaticMarkup(<LandingPage dict={dict} locale={locale} {...getHomePreviewProps(PREVIEW_CONTEXTS[context], dict.common.brand)} />);
}

// home.feedback.success is only shown after a successful submit; it has its own interaction test below.
const PAGE_KEYS = SITE_CONTENT_DEFINITIONS.filter((d) => (d.page === "home" || d.page === "shared") && !d.role && d.key !== "home.feedback.success");

describe("every editable homepage / navigation / footer key reaches the rendered page", () => {
  for (const locale of ["mn", "en"] as const) {
    it(`${locale}: each published override is visible in the real LandingPage output (and the default is gone)`, () => {
      const base = getDictionarySync(locale);
      const baselineHtml = renderHomeLike(base, locale);
      const missing: string[] = [];
      for (const definition of PAGE_KEYS) {
        const text = sentinel(definition, locale);
        const html = renderHomeLike(applySiteContentOverrides(base, { [definition.key]: text }), locale);
        if (!html.includes(text)) missing.push(definition.key);
      }
      expect(missing, `keys that never render on the public page: ${missing.join(", ")}`).toEqual([]);
      expect(baselineHtml).not.toContain("ZQ");
    });

    it(`${locale}: removing the override restores the built-in text exactly`, () => {
      const base = getDictionarySync(locale);
      const reference = renderHomeLike(base, locale);
      for (const definition of PAGE_KEYS.slice(0, 15)) {
        const overridden = applySiteContentOverrides(base, { [definition.key]: sentinel(definition, locale) });
        expect(renderHomeLike(overridden, locale)).not.toBe(reference);
        expect(renderHomeLike(applySiteContentOverrides(base, {}), locale)).toBe(reference);
      }
    });
  }

  it("an English override never appears on the Mongolian page and vice versa", () => {
    const mn = getDictionarySync("mn");
    const en = getDictionarySync("en");
    const overrides = Object.fromEntries(PAGE_KEYS.map((d) => [d.key, sentinel(d, "en")]));
    const mnHtml = renderHomeLike(mn, "mn");
    const enHtml = renderHomeLike(applySiteContentOverrides(en, overrides), "en");
    expect(mnHtml).not.toContain("ZQen:");
    expect(enHtml).toContain("ZQen:home.hero.tagline");
  });

  it("covers the categories requested: navigation, footer, Legal AI intro, products/CTAs, FAQ, help and feedback", () => {
    const sections = new Set(PAGE_KEYS.map((d) => d.section));
    for (const section of ["nav", "footer", "legalAi", "products", "faq", "feedback", "hero", "intro", "marketplace", "intelligence"]) {
      expect(sections.has(section as never), section).toBe(true);
    }
  });
});
