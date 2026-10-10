import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/application/common/actor-context";
import { SITE_CONTENT_DEFINITIONS } from "@/application/use-cases/site-content/catalog";
import {
  publishSiteContentUseCase,
  restoreSiteContentRevisionUseCase,
  saveSiteContentDraftUseCase,
  unpublishSiteContentUseCase,
  type SiteContentDeps,
} from "@/application/use-cases/site-content/manage-site-content";
import { withPublishedSiteContent } from "@/application/use-cases/site-content/published-site-content";
import { UserRole } from "@/domain/enums";
import { getSiteContentDefault } from "@/domain/site-content/registry";
import { getDictionarySync } from "@/i18n/get-dictionary-sync";
import { buildRootMetadata } from "@/lib/root-metadata";
import { FakeSiteContentRepository } from "./site-content-fake-repository";

const admin: ActorContext = { userId: "admin-1", role: UserRole.ADMIN };

function setup() {
  const repo = new FakeSiteContentRepository();
  const deps: SiteContentDeps = { siteContentRepository: repo, resolveActorLabel: async (id) => `label:${id}` };
  const load = (locale: "mn" | "en") => withPublishedSiteContent(getDictionarySync(locale), locale, (l) => repo.findPublished(l));
  return { repo, deps, load };
}

describe("publish → live → revert to default, for EVERY editable key", () => {
  it("each key: publishing changes the served dictionary at its path; unpublishing restores the exact built-in text; the other language never moves", async () => {
    const { repo, deps, load } = setup();
    for (const definition of SITE_CONTENT_DEFINITIONS) {
      const builtInMn = getSiteContentDefault(getDictionarySync("mn"), definition)!;
      const builtInEn = getSiteContentDefault(getDictionarySync("en"), definition)!;
      const text = `ZQ ${definition.key}`;

      const draft = await saveSiteContentDraftUseCase(admin, { key: definition.key, locale: "mn", value: text, expectedVersion: 0 }, deps);
      expect(getSiteContentDefault(await load("mn"), definition), `${definition.key}: draft must not be public`).toBe(builtInMn);

      const { entry } = await publishSiteContentUseCase(admin, { key: definition.key, locale: "mn", expectedVersion: draft.version }, deps);
      expect(getSiteContentDefault(await load("mn"), definition), `${definition.key}: published`).toBe(text);
      expect(getSiteContentDefault(await load("en"), definition), `${definition.key}: English must be untouched`).toBe(builtInEn);

      await unpublishSiteContentUseCase(admin, { key: definition.key, locale: "mn", expectedVersion: entry.version }, deps);
      expect(getSiteContentDefault(await load("mn"), definition), `${definition.key}: back to built-in`).toBe(builtInMn);
    }
    expect(repo.audits.filter((a) => a.metadata?.event === "unpublish")).toHaveLength(SITE_CONTENT_DEFINITIONS.length);
  });

  it("restoring an earlier revision then publishing brings that exact text back; restoring alone changes nothing public", async () => {
    const { deps, load, repo } = setup();
    const definition = SITE_CONTENT_DEFINITIONS.find((d) => d.key === "home.faq.0.answer")!;
    const first = await saveSiteContentDraftUseCase(admin, { key: definition.key, locale: "en", value: "First answer", expectedVersion: 0 }, deps);
    const p1 = await publishSiteContentUseCase(admin, { key: definition.key, locale: "en", expectedVersion: first.version }, deps);
    const second = await saveSiteContentDraftUseCase(admin, { key: definition.key, locale: "en", value: "Second answer", expectedVersion: p1.entry.version }, deps);
    const p2 = await publishSiteContentUseCase(admin, { key: definition.key, locale: "en", expectedVersion: second.version }, deps);
    expect(getSiteContentDefault(await load("en"), definition)).toBe("Second answer");

    const restored = await restoreSiteContentRevisionUseCase(admin, { key: definition.key, locale: "en", revision: 1, expectedVersion: p2.entry.version }, deps);
    expect(getSiteContentDefault(await load("en"), definition)).toBe("Second answer");
    await publishSiteContentUseCase(admin, { key: definition.key, locale: "en", expectedVersion: restored.version }, deps);
    expect(getSiteContentDefault(await load("en"), definition)).toBe("First answer");
    expect(repo.audits.map((a) => a.metadata?.event)).toEqual(["publish", "publish", "restore_revision", "publish"]);
  });
});

describe("page metadata (browser title and search description)", () => {
  const base = "https://tore.example";

  it("the root metadata title, description, Open Graph and Twitter text come from the published override", async () => {
    const { deps, load } = setup();
    for (const [key, value] of [["shared.meta.title", "TORE — шинэ гарчиг"], ["shared.meta.description", "Шинэ тайлбар."]] as const) {
      const d = await saveSiteContentDraftUseCase(admin, { key, locale: "mn", value, expectedVersion: 0 }, deps);
      await publishSiteContentUseCase(admin, { key, locale: "mn", expectedVersion: d.version }, deps);
    }
    const meta = buildRootMetadata({ dict: await load("mn"), locale: "mn", base, appName: "TORE" });
    expect(meta.title).toMatchObject({ default: "TORE — шинэ гарчиг" });
    expect(meta.description).toBe("Шинэ тайлбар.");
    expect(meta.openGraph).toMatchObject({ title: "TORE — шинэ гарчиг", description: "Шинэ тайлбар." });
    expect(meta.twitter).toMatchObject({ title: "TORE — шинэ гарчиг", description: "Шинэ тайлбар." });

    const en = buildRootMetadata({ dict: await load("en"), locale: "en", base, appName: "TORE" });
    expect(en.title).toMatchObject({ default: getDictionarySync("en").meta.title });
  });

  it("without an override the metadata is exactly what it was before this feature", () => {
    const mn = getDictionarySync("mn");
    const meta = buildRootMetadata({ dict: mn, locale: "mn", base, appName: "TORE" });
    expect(meta.title).toMatchObject({ default: mn.meta.title, template: "%s | TORE" });
    expect(meta.description).toBe(mn.meta.description);
  });
});

describe("routes are actually wired to the published-content loader", () => {
  const root = path.resolve(__dirname, "../..");
  const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

  it("every public page that shows editable text reads its dictionary through the loader", () => {
    expect(read("src/app/page.tsx")).toContain("loadPublicDictionary(base, locale)");
    expect(read("src/app/student/page.tsx")).toContain("loadPublicDictionary(base, locale)");
    expect(read("src/app/lawyers/page.tsx")).toContain("loadRequestDictionary()");
    expect(read("src/app/lawyers/[slug]/page.tsx")).toContain("loadRequestDictionary()");
    expect(read("src/app/layout.tsx")).toContain("loadRequestDictionary()");
    expect(read("src/app/layout.tsx")).toContain("buildRootMetadata(");
  });

  it("the loader reads only published values (never drafts) and is cached under the tag that publishing expires", () => {
    const loader = read("src/application/use-cases/site-content/load-public-dictionary.ts");
    expect(loader).toContain("findPublished");
    expect(loader).not.toMatch(/draft/i);
    expect(loader).toContain("SITE_CONTENT_CACHE_TAG");
  });
});
