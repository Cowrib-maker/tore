import { beforeEach, describe, expect, it } from "vitest";

import type { ActorContext } from "@/application/common/actor-context";
import { buildLegacyImportReportUseCase, importLegacyHomepageContentUseCase, type LegacyImportDeps } from "@/application/use-cases/site-content/legacy-homepage-import";
import type { HomepageLandingContent } from "@/domain/entities/homepage-content";
import { UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import type { HomepageContentRepository } from "@/domain/repositories/homepage-content-repository";
import type { Locale } from "@/i18n/config";
import { getDictionarySync } from "@/i18n/get-dictionary-sync";
import { FakeSiteContentRepository } from "./site-content-fake-repository";

const admin: ActorContext = { userId: "admin-1", role: UserRole.ADMIN };
const client: ActorContext = { userId: "c-1", role: UserRole.CLIENT };

function legacyRepo(records: Array<{ locale: Locale; content: HomepageLandingContent }>): HomepageContentRepository {
  return {
    findByLocale: async (locale: Locale) => records.find((r) => r.locale === locale) ? { ...records.find((r) => r.locale === locale)!, updatedAt: new Date() } : null,
    findAll: async () => records.map((r) => ({ ...r, updatedAt: new Date() })),
    upsert: async () => { throw new Error("legacy table must never be written"); },
  } as unknown as HomepageContentRepository;
}

const audits: Array<Record<string, unknown>> = [];
let site: FakeSiteContentRepository;

function deps(records: Array<{ locale: Locale; content: HomepageLandingContent }>): LegacyImportDeps {
  return {
    siteContentRepository: site,
    homepageContentRepository: legacyRepo(records),
    auditLogRepository: { create: async (input: Record<string, unknown>) => { audits.push(input); return input as never; }, list: async () => ({ items: [], total: 0 }) } as never,
    resolveActorLabel: async () => "Test Admin",
  };
}

function legacyWith(locale: "mn" | "en", patch: Partial<HomepageLandingContent>): HomepageLandingContent {
  return { ...structuredClone(getDictionarySync(locale).landing), ...patch } as HomepageLandingContent;
}

beforeEach(() => {
  site = new FakeSiteContentRepository();
  audits.length = 0;
});

describe("legacy /admin/homepage content is preserved and migrated as drafts", () => {
  it("only admins can see the report or import", async () => {
    await expect(buildLegacyImportReportUseCase(client, deps([]))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(importLegacyHomepageContentUseCase(client, deps([]))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("nothing to migrate when no legacy rows exist or they equal the built-in text", async () => {
    expect((await buildLegacyImportReportUseCase(admin, deps([]))).rows).toEqual([]);
    const same = [{ locale: "mn" as const, content: legacyWith("mn", {}) }];
    const report = await buildLegacyImportReportUseCase(admin, deps(same));
    expect(report.rows).toEqual([]);
    expect(report.unmappedChangedFields).toBe(0);
  });

  it("maps edited legacy fields (including FAQ array items) onto content keys, per language", async () => {
    const mn = legacyWith("mn", { marketTitle: "Хуучин засварласан гарчиг", faqs: getDictionarySync("mn").landing.faqs.map((f, i) => (i === 1 ? { ...f, a: "Хуучин засварласан хариулт" } : f)) });
    const en = legacyWith("en", { faqTitle: "Legacy FAQ title" });
    const report = await buildLegacyImportReportUseCase(admin, deps([{ locale: "mn", content: mn }, { locale: "en", content: en }]));
    expect(report.rows.map((r) => `${r.key}:${r.locale}:${r.status}`).sort()).toEqual([
      "home.faq.1.answer:mn:importable",
      "home.faq.title:en:importable",
      "home.marketplace.title:mn:importable",
    ]);
    expect(report.rows.find((r) => r.key === "home.faq.1.answer")).toMatchObject({ legacyValue: "Хуучин засварласан хариулт" });
  });

  it("imports as UNPUBLISHED drafts: nothing goes live, the legacy table is untouched, one audit record is written", async () => {
    const mn = legacyWith("mn", { marketTitle: "Хуучин гарчиг" });
    const result = await importLegacyHomepageContentUseCase(admin, deps([{ locale: "mn", content: mn }]), "10.0.0.2");
    expect(result).toEqual({ imported: 1, skippedManaged: 0, invalid: 0 });
    const entry = await site.find("home.marketplace.title", "mn");
    expect(entry).toMatchObject({ draftValue: "Хуучин гарчиг", publishedValue: null, updatedByLabel: "Test Admin" });
    expect(await site.findPublished("mn")).toEqual({});
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorUserId: "admin-1", ipAddress: "10.0.0.2", metadata: { event: "legacy_import", imported: 1, keys: ["home.marketplace.title:mn"] } });
  });

  it("is idempotent and never overwrites a value the administrator already manages in the new system", async () => {
    const mn = legacyWith("mn", { marketTitle: "Хуучин гарчиг", faqTitle: "Хуучин FAQ" });
    const first = await site.saveDraft({ key: "home.faq.title", locale: "mn", value: "Шинэ системд бичсэн", expectedVersion: 0, actor: { userId: "a", label: "A" } });
    expect(first.version).toBe(1);
    const run1 = await importLegacyHomepageContentUseCase(admin, deps([{ locale: "mn", content: mn }]));
    expect(run1).toEqual({ imported: 1, skippedManaged: 1, invalid: 0 });
    expect((await site.find("home.faq.title", "mn"))?.draftValue).toBe("Шинэ системд бичсэн");
    const run2 = await importLegacyHomepageContentUseCase(admin, deps([{ locale: "mn", content: mn }]));
    expect(run2.imported).toBe(0);
    expect(audits).toHaveLength(1);
  });

  it("refuses to import legacy values that fail today's validation (markup) and reports them", async () => {
    const mn = legacyWith("mn", { marketTitle: "<script>alert(1)</script>" });
    const report = await buildLegacyImportReportUseCase(admin, deps([{ locale: "mn", content: mn }]));
    expect(report.rows[0]).toMatchObject({ key: "home.marketplace.title", status: "invalid" });
    const result = await importLegacyHomepageContentUseCase(admin, deps([{ locale: "mn", content: mn }]));
    expect(result).toEqual({ imported: 0, skippedManaged: 0, invalid: 1 });
    expect(await site.find("home.marketplace.title", "mn")).toBeNull();
  });

  it("counts saved edits that have no key in the new system as preserved-but-unmapped, and never imports ko/zh copies", async () => {
    const mn = legacyWith("mn", { headline: "Хэзээ ч харагддаггүй гарчиг", osEyebrow: "x" });
    const ko = legacyWith("mn", { marketTitle: "korean machine copy" });
    const report = await buildLegacyImportReportUseCase(admin, deps([{ locale: "mn", content: mn }, { locale: "ko" as Locale, content: ko }]));
    expect(report.rows).toEqual([]);
    expect(report.unmappedChangedFields).toBeGreaterThanOrEqual(2);
    expect(report.legacyLocalesFound).toEqual(["mn", "ko"]);
  });
});
