import { beforeEach, describe, expect, it } from "vitest";

import type { ActorContext } from "@/application/common/actor-context";
import {
  SITE_CONTENT_AUDIT_ENTITY,
  discardSiteContentDraftUseCase,
  getPreviewOverridesUseCase,
  getSiteContentItemUseCase,
  listSiteContentUseCase,
  publishSiteContentUseCase,
  restoreSiteContentRevisionUseCase,
  saveSiteContentDraftUseCase,
  unpublishSiteContentUseCase,
  type SiteContentDeps,
} from "@/application/use-cases/site-content/manage-site-content";
import { UserRole } from "@/domain/enums";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors/domain-error";
import { FakeSiteContentRepository } from "./site-content-fake-repository";

const admin: ActorContext = { userId: "admin-1", role: UserRole.ADMIN };
const admin2: ActorContext = { userId: "admin-2", role: UserRole.ADMIN };
const client: ActorContext = { userId: "u-1", role: UserRole.CLIENT };
const lawyer: ActorContext = { userId: "l-1", role: UserRole.LAWYER };
const KEY = "home.hero.tagline";

let repo: FakeSiteContentRepository;
let deps: SiteContentDeps;

beforeEach(() => {
  repo = new FakeSiteContentRepository();
  deps = { siteContentRepository: repo, resolveActorLabel: async (id) => `label:${id}` };
});

async function draftAndPublish(actor: ActorContext, value: string, locale = "mn") {
  const current = await repo.find(KEY, locale as "mn" | "en");
  const draft = await saveSiteContentDraftUseCase(actor, { key: KEY, locale, value, expectedVersion: current?.version ?? 0 }, deps);
  return publishSiteContentUseCase(actor, { key: KEY, locale, expectedVersion: draft.version }, deps);
}

describe("authorization: only an ADMIN may touch site content", () => {
  it.each([
    ["client", client],
    ["lawyer", lawyer],
  ])("%s is refused on every operation and nothing is read or written", async (_n, actor) => {
    const calls: Array<() => Promise<unknown>> = [
      () => listSiteContentUseCase(actor, deps),
      () => getSiteContentItemUseCase(actor, KEY, deps),
      () => saveSiteContentDraftUseCase(actor, { key: KEY, locale: "mn", value: "x", expectedVersion: 0 }, deps),
      () => discardSiteContentDraftUseCase(actor, { key: KEY, locale: "mn", expectedVersion: 1 }, deps),
      () => publishSiteContentUseCase(actor, { key: KEY, locale: "mn", expectedVersion: 1 }, deps),
      () => unpublishSiteContentUseCase(actor, { key: KEY, locale: "mn", expectedVersion: 1 }, deps),
      () => restoreSiteContentRevisionUseCase(actor, { key: KEY, locale: "mn", expectedVersion: 1, revision: 1 }, deps),
      () => getPreviewOverridesUseCase(actor, "mn", "draft", deps),
    ];
    for (const call of calls) await expect(call()).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.writes).toBe(0);
    expect(repo.audits).toHaveLength(0);
  });
});

describe("draft → publish → history", () => {
  it("a draft is invisible to the public until published", async () => {
    await saveSiteContentDraftUseCase(admin, { key: KEY, locale: "mn", value: "Ноорог уриа", expectedVersion: 0 }, deps);
    expect(await repo.findPublished("mn")).toEqual({});
    const { item } = await getSiteContentItemUseCase(admin, KEY, deps);
    expect(item.locales.mn.hasPendingDraft).toBe(true);
    expect(item.locales.mn.editorValue).toBe("Ноорог уриа");
    expect(item.locales.mn.publishedValue).toBeNull();
  });

  it("publishing makes it live, records revision 1 with the administrator's identity and time, and clears the pending draft", async () => {
    const { entry, revision } = await draftAndPublish(admin, "Шинэ уриа");
    expect(revision).toBe(1);
    expect(await repo.findPublished("mn")).toEqual({ [KEY]: "Шинэ уриа" });
    expect(entry.draftValue).toBeNull();
    expect(entry.publishedByLabel).toBe("label:admin-1");
    expect(entry.publishedAt).toBeInstanceOf(Date);
    const revs = await repo.listRevisions(KEY, "mn", 10);
    expect(revs).toHaveLength(1);
    expect(revs[0]).toMatchObject({ revision: 1, value: "Шинэ уриа", createdByLabel: "label:admin-1" });
  });

  it("keeps an immutable, ordered history across publishes (newest first)", async () => {
    await draftAndPublish(admin, "Нэг");
    await draftAndPublish(admin2, "Хоёр");
    await draftAndPublish(admin, "Гурав");
    const revs = await repo.listRevisions(KEY, "mn", 10);
    expect(revs.map((r) => [r.revision, r.value, r.createdByLabel])).toEqual([
      [3, "Гурав", "label:admin-1"],
      [2, "Хоёр", "label:admin-2"],
      [1, "Нэг", "label:admin-1"],
    ]);
    expect(await repo.findPublished("mn")).toEqual({ [KEY]: "Гурав" });
  });

  it("cannot publish when there is no draft", async () => {
    const { entry } = await draftAndPublish(admin, "Нэг");
    await expect(publishSiteContentUseCase(admin, { key: KEY, locale: "mn", expectedVersion: entry.version }, deps)).rejects.toBeInstanceOf(ValidationError);
  });

  it("unpublish falls back to the code default but keeps the history", async () => {
    const { entry } = await draftAndPublish(admin, "Нэг");
    await unpublishSiteContentUseCase(admin, { key: KEY, locale: "mn", expectedVersion: entry.version }, deps);
    expect(await repo.findPublished("mn")).toEqual({});
    expect(await repo.listRevisions(KEY, "mn", 10)).toHaveLength(1);
  });

  it("discarding a draft leaves the published value untouched", async () => {
    const { entry } = await draftAndPublish(admin, "Нийтлэгдсэн");
    const d = await saveSiteContentDraftUseCase(admin, { key: KEY, locale: "mn", value: "Ноорог", expectedVersion: entry.version }, deps);
    await discardSiteContentDraftUseCase(admin, { key: KEY, locale: "mn", expectedVersion: d.version }, deps);
    expect(await repo.findPublished("mn")).toEqual({ [KEY]: "Нийтлэгдсэн" });
    expect((await repo.find(KEY, "mn"))?.draftValue).toBeNull();
  });
});

describe("Mongolian / English separation", () => {
  it("publishing one locale never changes the other", async () => {
    await draftAndPublish(admin, "Монгол текст", "mn");
    expect(await repo.findPublished("mn")).toEqual({ [KEY]: "Монгол текст" });
    expect(await repo.findPublished("en")).toEqual({});
    await draftAndPublish(admin, "English text", "en");
    expect(await repo.findPublished("mn")).toEqual({ [KEY]: "Монгол текст" });
    expect(await repo.findPublished("en")).toEqual({ [KEY]: "English text" });
  });

  it("revision numbers are independent per locale", async () => {
    await draftAndPublish(admin, "a", "mn");
    await draftAndPublish(admin, "b", "mn");
    const { revision } = await draftAndPublish(admin, "c", "en");
    expect(revision).toBe(1);
  });

  it("rejects locales that are not supported for editing", async () => {
    await expect(saveSiteContentDraftUseCase(admin, { key: KEY, locale: "ko", value: "x", expectedVersion: 0 }, deps)).rejects.toBeInstanceOf(ValidationError);
    await expect(saveSiteContentDraftUseCase(admin, { key: KEY, locale: "../mn", value: "x", expectedVersion: 0 }, deps)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("validation and unknown keys", () => {
  it("rejects script/markup before anything is stored", async () => {
    await expect(saveSiteContentDraftUseCase(admin, { key: KEY, locale: "mn", value: "<script>alert(1)</script>", expectedVersion: 0 }, deps)).rejects.toBeInstanceOf(ValidationError);
    expect(repo.writes).toBe(0);
  });

  it("refuses keys that are not in the allowlist (prices, auth messages, anything else)", async () => {
    for (const key of ["billing.plans.price", "auth.signIn", "__proto__", "publicHome.tagline", ""]) {
      await expect(saveSiteContentDraftUseCase(admin, { key, locale: "mn", value: "x", expectedVersion: 0 }, deps)).rejects.toBeInstanceOf(NotFoundError);
    }
    expect(repo.writes).toBe(0);
  });

  it("rejects malformed version numbers", async () => {
    for (const expectedVersion of [-1, 1.5, Number.NaN]) {
      await expect(saveSiteContentDraftUseCase(admin, { key: KEY, locale: "mn", value: "x", expectedVersion }, deps)).rejects.toBeInstanceOf(ValidationError);
    }
  });
});

describe("concurrent edits", () => {
  it("two administrators opening the same version: the second save is refused, not silently merged", async () => {
    const first = await saveSiteContentDraftUseCase(admin, { key: KEY, locale: "mn", value: "Анхны", expectedVersion: 0 }, deps);
    // Both admins load version `first.version`.
    await saveSiteContentDraftUseCase(admin, { key: KEY, locale: "mn", value: "Админ 1", expectedVersion: first.version }, deps);
    await expect(
      saveSiteContentDraftUseCase(admin2, { key: KEY, locale: "mn", value: "Админ 2", expectedVersion: first.version }, deps),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await repo.find(KEY, "mn"))?.draftValue).toBe("Админ 1");
  });

  it("two creators of a brand-new entry: the second is refused", async () => {
    await saveSiteContentDraftUseCase(admin, { key: KEY, locale: "mn", value: "A", expectedVersion: 0 }, deps);
    await expect(saveSiteContentDraftUseCase(admin2, { key: KEY, locale: "mn", value: "B", expectedVersion: 0 }, deps)).rejects.toBeInstanceOf(ConflictError);
  });

  it("publishing a version that has since changed is refused (you publish what you reviewed)", async () => {
    const d1 = await saveSiteContentDraftUseCase(admin, { key: KEY, locale: "mn", value: "A", expectedVersion: 0 }, deps);
    await saveSiteContentDraftUseCase(admin2, { key: KEY, locale: "mn", value: "B", expectedVersion: d1.version }, deps);
    await expect(publishSiteContentUseCase(admin, { key: KEY, locale: "mn", expectedVersion: d1.version }, deps)).rejects.toBeInstanceOf(ConflictError);
    expect(await repo.findPublished("mn")).toEqual({});
  });

  it("a double-submitted publish creates exactly one revision", async () => {
    const d = await saveSiteContentDraftUseCase(admin, { key: KEY, locale: "mn", value: "A", expectedVersion: 0 }, deps);
    const results = await Promise.allSettled([
      publishSiteContentUseCase(admin, { key: KEY, locale: "mn", expectedVersion: d.version }, deps),
      publishSiteContentUseCase(admin, { key: KEY, locale: "mn", expectedVersion: d.version }, deps),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await repo.listRevisions(KEY, "mn", 10)).toHaveLength(1);
    expect(repo.audits.filter((a) => a.metadata?.event === "publish")).toHaveLength(1);
  });
});

describe("audit trail", () => {
  it("records publish with actor, entity, key, locale and revision", async () => {
    await draftAndPublish(admin, "Шинэ");
    expect(repo.audits).toHaveLength(1);
    expect(repo.audits[0]).toMatchObject({
      actorUserId: "admin-1",
      entityType: SITE_CONTENT_AUDIT_ENTITY,
      entityId: `${KEY}:mn`,
      metadata: { event: "publish", key: KEY, locale: "mn", revision: 1 },
    });
  });

  it("records unpublish and revision restoration", async () => {
    const { entry } = await draftAndPublish(admin, "Нэг");
    const restored = await restoreSiteContentRevisionUseCase(admin2, { key: KEY, locale: "mn", expectedVersion: entry.version, revision: 1 }, deps, "10.0.0.1");
    await unpublishSiteContentUseCase(admin, { key: KEY, locale: "mn", expectedVersion: restored.version }, deps);
    expect(repo.audits.map((a) => [a.actorUserId, a.metadata?.event])).toEqual([
      ["admin-1", "publish"],
      ["admin-2", "restore_revision"],
      ["admin-1", "unpublish"],
    ]);
    expect(repo.audits[1]).toMatchObject({ ipAddress: "10.0.0.1", metadata: { revision: 1 } });
  });

  it("does not put the text itself into the audit metadata", async () => {
    await draftAndPublish(admin, "Нууц биш текст");
    expect(JSON.stringify(repo.audits)).not.toContain("Нууц биш текст");
  });

  it("if the audit record cannot be stored the publish is NOT applied and the caller sees the failure", async () => {
    const d = await saveSiteContentDraftUseCase(admin, { key: KEY, locale: "mn", value: "Шинэ", expectedVersion: 0 }, deps);
    repo.failAudit = true;
    await expect(publishSiteContentUseCase(admin, { key: KEY, locale: "mn", expectedVersion: d.version }, deps)).rejects.toThrow("audit store down");
    expect(await repo.findPublished("mn")).toEqual({});
    expect(await repo.listRevisions(KEY, "mn", 10)).toHaveLength(0);
    expect((await repo.find(KEY, "mn"))?.draftValue).toBe("Шинэ");
  });
});

describe("revision restoration", () => {
  it("restores an old revision into the DRAFT only; it goes live only after a normal publish", async () => {
    const r1 = await draftAndPublish(admin, "Хуучин");
    await saveSiteContentDraftUseCase(admin, { key: KEY, locale: "mn", value: "Шинэ", expectedVersion: r1.entry.version }, deps);
    const cur = (await repo.find(KEY, "mn"))!;
    const published2 = await publishSiteContentUseCase(admin, { key: KEY, locale: "mn", expectedVersion: cur.version }, deps);
    expect(await repo.findPublished("mn")).toEqual({ [KEY]: "Шинэ" });

    const restored = await restoreSiteContentRevisionUseCase(admin, { key: KEY, locale: "mn", expectedVersion: published2.entry.version, revision: 1 }, deps);
    expect(restored.draftValue).toBe("Хуучин");
    expect(await repo.findPublished("mn")).toEqual({ [KEY]: "Шинэ" }); // still the live one
    const again = await publishSiteContentUseCase(admin, { key: KEY, locale: "mn", expectedVersion: restored.version }, deps);
    expect(again.revision).toBe(3); // history is append-only: restoring never rewrites revision 1
    expect(await repo.findPublished("mn")).toEqual({ [KEY]: "Хуучин" });
  });

  it("refuses a revision that does not exist and a stale version", async () => {
    const r = await draftAndPublish(admin, "Нэг");
    await expect(restoreSiteContentRevisionUseCase(admin, { key: KEY, locale: "mn", expectedVersion: r.entry.version, revision: 99 }, deps)).rejects.toBeInstanceOf(NotFoundError);
    await expect(restoreSiteContentRevisionUseCase(admin, { key: KEY, locale: "mn", expectedVersion: r.entry.version - 1, revision: 1 }, deps)).rejects.toBeInstanceOf(ConflictError);
    await expect(restoreSiteContentRevisionUseCase(admin, { key: KEY, locale: "mn", expectedVersion: r.entry.version, revision: 0 }, deps)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("list and preview overlays", () => {
  it("lists every registered key with the code default when nothing is stored", async () => {
    const items = await listSiteContentUseCase(admin, deps);
    expect(items.length).toBeGreaterThan(5);
    const tagline = items.find((i) => i.definition.key === KEY)!;
    expect(tagline.locales.mn.defaultValue).toBe("Хуулийг ойлгож, шийдлийг бүтээ.");
    expect(tagline.locales.en.defaultValue).toBe("Understand the law, build the solution.");
    expect(tagline.locales.mn.version).toBe(0);
  });

  it("preview overlay: published-only excludes drafts; draft mode includes them; neither writes", async () => {
    const r = await draftAndPublish(admin, "Нийтлэгдсэн");
    await saveSiteContentDraftUseCase(admin, { key: KEY, locale: "mn", value: "Ноорог", expectedVersion: r.entry.version }, deps);
    await saveSiteContentDraftUseCase(admin, { key: "home.intro.title", locale: "mn", value: "Өөр ноорог", expectedVersion: 0 }, deps);
    const writesBefore = repo.writes;
    expect(await getPreviewOverridesUseCase(admin, "mn", "published", deps)).toEqual({ [KEY]: "Нийтлэгдсэн" });
    expect(await getPreviewOverridesUseCase(admin, "mn", "draft", deps)).toEqual({ [KEY]: "Ноорог", "home.intro.title": "Өөр ноорог" });
    expect(await getPreviewOverridesUseCase(admin, "en", "draft", deps)).toEqual({});
    expect(repo.writes).toBe(writesBefore);
  });
});
