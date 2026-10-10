/// <reference types="vite/client" />
/**
 * TORE Spell public page ↔ content editor. These tests need the Spell product code, which lives on a different branch than the content
 * system; they are skipped (not failed) where `src/components/marketing/spell-landing.tsx` does not exist, and run for real on any tree
 * that has both.
 */
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
  usePathname: () => "/spell",
  useSearchParams: () => new URLSearchParams(),
}));
const loadPublicDictionaryMock = vi.hoisted(() => ({ overrides: {} as Record<string, string> }));
vi.mock("@/application/common/session", () => ({ getSessionUser: async () => null }));
// The page's only content dependency is the loader; swap just its data source (the repository) so the REAL page code runs.
vi.mock("@/application/use-cases/site-content/load-public-dictionary", async () => {
  const { applySiteContentOverrides } = await import("@/domain/site-content/registry");
  const { getDictionarySync } = await import("@/i18n/get-dictionary-sync");
  return {
    loadPublicDictionary: async (dict: unknown) => applySiteContentOverrides(dict as object, loadPublicDictionaryMock.overrides),
    loadRequestDictionary: async () => applySiteContentOverrides(getDictionarySync("mn"), loadPublicDictionaryMock.overrides),
  };
});

import { SITE_CONTENT_DEFINITIONS } from "@/application/use-cases/site-content/catalog";
import { withPublishedSiteContent } from "@/application/use-cases/site-content/published-site-content";
import { getHomePreviewProps, PREVIEW_CONTEXTS } from "@/domain/admin-preview/scenarios";
import { applySiteContentOverrides, validateSiteContentValue, type SiteContentDefinition } from "@/domain/site-content/registry";
import { getDictionarySync } from "@/i18n/get-dictionary-sync";

const landingModules = import.meta.glob("/src/components/marketing/spell-landing.tsx");
type SpellLandingProps = {
  dict: unknown;
  locale: string;
  authUser: { displayName: string; dashboardHref: string } | null;
  plans: unknown[];
  purchaseAvailable: boolean;
  installerReady: boolean;
};
// Typed loosely on purpose: this file must typecheck on trees that do not contain the Spell component.
async function loadSpellLanding(): Promise<ComponentType<SpellLandingProps>> {
  const mod = (await landingModules["/src/components/marketing/spell-landing.tsx"]!()) as { SpellLanding: ComponentType<SpellLandingProps> };
  return mod.SpellLanding;
}
const spellPresent = Object.keys(landingModules).length > 0;
const SPELL_KEYS = SITE_CONTENT_DEFINITIONS.filter((d) => d.page === "spell");

// `dict.spell` only exists on trees that contain Spell; read it without depending on the type.
const spellCopy = (dict: unknown) => (dict as { spell: { hero: { title: string }; meta: { title: string; description: string } } }).spell;

function sentinel(definition: SiteContentDefinition, locale: string): string {
  const value = `ZQ${locale}:${definition.key}`;
  const checked = validateSiteContentValue(definition, value);
  if (!checked.ok) throw new Error(`${definition.key}: ${checked.reason}`);
  return checked.value;
}

describe.skipIf(!spellPresent)("TORE Spell page renders published content", () => {
  it("the Spell keys are available exactly when the Spell copy exists", () => {
    expect(SPELL_KEYS.length).toBeGreaterThan(20);
  });

  for (const locale of ["mn", "en"] as const) {
    it(`${locale}: every non-metadata Spell key reaches the real SpellLanding output`, async () => {
      const SpellLanding = await loadSpellLanding();
      const base = getDictionarySync(locale);
      const render = (dict: typeof base) =>
        renderToStaticMarkup(<SpellLanding dict={dict} locale={locale} authUser={null} plans={[]} purchaseAvailable={false} installerReady />);
      const missing: string[] = [];
      for (const definition of SPELL_KEYS.filter((d) => !d.role)) {
        const text = sentinel(definition, locale);
        if (!render(applySiteContentOverrides(base, { [definition.key]: text })).includes(text)) missing.push(definition.key);
      }
      expect(missing, `Spell keys that never render: ${missing.join(", ")}`).toEqual([]);
      expect(render(base)).not.toContain("ZQ");
    });
  }

  it("shows the built-in text again after a key is reverted (published → unpublished)", async () => {
    const SpellLanding = await loadSpellLanding();
    const base = getDictionarySync("mn");
    const published: Record<string, string> = { "spell.hero.title": "ZQ шинэ гарчиг" };
    const render = async () => {
      const dict = await withPublishedSiteContent(base, "mn", async () => ({ ...published }));
      return renderToStaticMarkup(<SpellLanding dict={dict} locale="mn" authUser={null} plans={[]} purchaseAvailable={false} installerReady />);
    };
    expect(await render()).toContain("ZQ шинэ гарчиг");
    delete published["spell.hero.title"];
    const reverted = await render();
    expect(reverted).not.toContain("ZQ шинэ гарчиг");
    expect(reverted).toContain(spellCopy(base).hero.title);
  });

  it("an English Spell override never reaches the Mongolian page", async () => {
    const SpellLanding = await loadSpellLanding();
    const mn = getDictionarySync("mn");
    const html = renderToStaticMarkup(<SpellLanding dict={mn} locale="mn" authUser={null} plans={[]} purchaseAvailable={false} installerReady />);
    expect(html).not.toContain("ZQen:");
    const en = applySiteContentOverrides(getDictionarySync("en"), { "spell.hero.title": "ZQen:title" });
    expect(renderToStaticMarkup(<SpellLanding dict={en} locale="en" authUser={null} plans={[]} purchaseAvailable={false} installerReady />)).toContain("ZQen:title");
  });

  it("price, checkout, licence-rule and unsigned-installer text is NOT editable and stays code-owned", () => {
    for (const path of ["spell.pricing.note", "spell.pricing.buy", "spell.pricing.checkout.paidNote", "spell.download.unsigned", "spell.hero.priceFrom", "spell.hero.primaryCta"]) {
      expect(SPELL_KEYS.some((d) => d.dictionaryPath === path), path).toBe(false);
    }
  });

  it("metadata keys feed the real /spell page <title>, description and Open Graph tags", async () => {
    const modules = import.meta.glob("/src/app/spell/page.tsx");
    const mod = (await modules["/src/app/spell/page.tsx"]!()) as {
      generateMetadata: () => Promise<{ title: { absolute: string }; description: string; openGraph: { title: string; description: string } }>;
    };
    loadPublicDictionaryMock.overrides = {};
    const base = getDictionarySync("mn");
    const before = await mod.generateMetadata();
    expect(before.title.absolute).toBe(spellCopy(base).meta.title);
    expect(before.description).toBe(spellCopy(base).meta.description);

    loadPublicDictionaryMock.overrides = { "spell.meta.title": "Шинэ Spell гарчиг", "spell.meta.description": "Шинэ Spell тайлбар." };
    const after = await mod.generateMetadata();
    expect(after.title.absolute).toBe("Шинэ Spell гарчиг");
    expect(after.description).toBe("Шинэ Spell тайлбар.");
    expect(after.openGraph).toMatchObject({ title: "Шинэ Spell гарчиг", description: "Шинэ Spell тайлбар." });
  });

  it("the Spell preview renders for every synthetic context without a price or a download link", async () => {
    const SpellLanding = await loadSpellLanding();
    const dict = getDictionarySync("mn");
    for (const context of Object.values(PREVIEW_CONTEXTS)) {
      const html = renderToStaticMarkup(
        <SpellLanding dict={dict} locale="mn" authUser={getHomePreviewProps(context, dict.common.brand).authUser} plans={[]} purchaseAvailable={false} installerReady={false} />,
      );
      expect(html.replace(/<[^>]+>/g, " "), "no price text in the preview").not.toMatch(/₮|\d{1,3}(,\d{3})+/);
      expect(html).not.toContain("/api/spell/download");
    }
  });
});
