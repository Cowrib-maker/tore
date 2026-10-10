import { describe, expect, it, vi } from "vitest";

import { withPublishedSiteContent } from "@/application/use-cases/site-content/published-site-content";
import { getDictionarySync } from "@/i18n/get-dictionary-sync";

const mn = getDictionarySync("mn");
const en = getDictionarySync("en");

describe("public homepage text with published overrides", () => {
  it("applies published text for the requested locale only", async () => {
    const loader = vi.fn(async (locale: "mn" | "en") => (locale === "mn" ? { "home.hero.tagline": "Шинэ уриа" } : { "home.hero.tagline": "New tagline" }));
    const outMn = await withPublishedSiteContent(mn, "mn", loader);
    const outEn = await withPublishedSiteContent(en, "en", loader);
    expect(outMn.publicHome.tagline).toBe("Шинэ уриа");
    expect(outEn.publicHome.tagline).toBe("New tagline");
    expect(loader).toHaveBeenCalledWith("mn");
    expect(loader).toHaveBeenCalledWith("en");
  });

  it("returns the built-in dictionary unchanged when nothing is published", async () => {
    expect(await withPublishedSiteContent(mn, "mn", async () => ({}))).toBe(mn);
  });

  it("falls back to built-in text if the database/cache fails — the homepage must not break", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await withPublishedSiteContent(mn, "mn", async () => {
      throw new Error("connection refused");
    });
    expect(out).toBe(mn);
    spy.mockRestore();
  });

  it("does not apply overrides for locales that are not editable (ko, zh)", async () => {
    const loader = vi.fn(async () => ({ "home.hero.tagline": "x" }));
    const ko = getDictionarySync("ko");
    expect(await withPublishedSiteContent(ko, "ko", loader)).toBe(ko);
    expect(loader).not.toHaveBeenCalled();
  });

  it("a poisoned stored value (script, unknown key) cannot reach the page", async () => {
    const out = await withPublishedSiteContent(mn, "mn", async () => ({
      "home.hero.tagline": '<img src=x onerror="alert(1)">',
      "billing.price": "0",
    }));
    expect(out.publicHome.tagline).toBe(mn.publicHome.tagline);
  });
});
