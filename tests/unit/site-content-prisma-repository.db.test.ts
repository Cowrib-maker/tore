/**
 * Real-PostgreSQL contract test for PrismaSiteContentRepository. Skipped unless SITE_CONTENT_DB_TEST=1 and DATABASE_URL points at a
 * THROWAWAY database that has had `prisma migrate deploy` applied. It truncates the site-content tables.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ConflictError, NotFoundError, ValidationError } from "@/domain/errors/domain-error";

const enabled = process.env.SITE_CONTENT_DB_TEST === "1";

describe.skipIf(!enabled)("PrismaSiteContentRepository on real PostgreSQL", () => {
  const actor = { userId: "admin-1", label: "admin@example.test" };
  const actor2 = { userId: "admin-2", label: "second@example.test" };
  const KEY = "home.hero.tagline";
  const audit = (event: string) => ({ actorUserId: actor.userId, action: "UPDATE" as never, entityType: "SiteContent", entityId: `${KEY}:mn`, metadata: { event } });

  async function load() {
    const [{ prisma }, { PrismaSiteContentRepository }] = await Promise.all([
      import("@/infrastructure/database/prisma"),
      import("@/infrastructure/repositories/prisma-site-content-repository"),
    ]);
    return { prisma, repo: new PrismaSiteContentRepository() };
  }

  beforeEach(async () => {
    const { prisma } = await load();
    await prisma.siteContentRevision.deleteMany();
    await prisma.siteContentEntry.deleteMany();
    await prisma.auditLog.deleteMany({ where: { entityType: "SiteContent" } });
    // audit_logs.actor_user_id is a real foreign key, so the acting admins must exist (as they always do in production).
    for (const a of [actor, actor2]) {
      await prisma.user.upsert({
        where: { id: a.userId },
        update: {},
        create: { id: a.userId, email: a.label, name: a.label, role: "ADMIN" },
      });
    }
  });

  afterAll(async () => {
    const { prisma } = await load();
    await prisma.siteContentRevision.deleteMany();
    await prisma.siteContentEntry.deleteMany();
    await prisma.auditLog.deleteMany({ where: { entityType: "SiteContent" } });
    await prisma.user.deleteMany({ where: { id: { in: [actor.userId, actor2.userId] } } });
    await prisma.$disconnect();
  });

  it("draft → publish → published read → revision + audit, atomically", async () => {
    const { repo, prisma } = await load();
    const d = await repo.saveDraft({ key: KEY, locale: "mn", value: "Шинэ уриа", expectedVersion: 0, actor });
    expect(d).toMatchObject({ version: 1, draftValue: "Шинэ уриа", publishedValue: null });
    expect(await repo.findPublished("mn")).toEqual({});

    const { entry, revision } = await repo.publish({ key: KEY, locale: "mn", expectedVersion: d.version, actor, audit: () => audit("publish") });
    expect(revision).toBe(1);
    expect(entry).toMatchObject({ publishedValue: "Шинэ уриа", draftValue: null, publishedRevision: 1, publishedByLabel: actor.label });
    expect(entry.publishedAt).toBeInstanceOf(Date);
    expect(await repo.findPublished("mn")).toEqual({ [KEY]: "Шинэ уриа" });
    expect(await repo.findPublished("en")).toEqual({});
    expect((await repo.listRevisions(KEY, "mn", 10))[0]).toMatchObject({ revision: 1, value: "Шинэ уриа", createdByLabel: actor.label });
    expect(await prisma.auditLog.count({ where: { entityType: "SiteContent" } })).toBe(1);
  });

  it("a stale write is refused and changes nothing; the same for a stale publish", async () => {
    const { repo } = await load();
    const d = await repo.saveDraft({ key: KEY, locale: "mn", value: "A", expectedVersion: 0, actor });
    await repo.saveDraft({ key: KEY, locale: "mn", value: "B", expectedVersion: d.version, actor: actor2 });
    await expect(repo.saveDraft({ key: KEY, locale: "mn", value: "C", expectedVersion: d.version, actor })).rejects.toBeInstanceOf(ConflictError);
    await expect(repo.publish({ key: KEY, locale: "mn", expectedVersion: d.version, actor, audit: () => audit("publish") })).rejects.toBeInstanceOf(ConflictError);
    expect((await repo.find(KEY, "mn"))?.draftValue).toBe("B");
    expect(await repo.findPublished("mn")).toEqual({});
  });

  it("two concurrent creators of the same entry: exactly one wins", async () => {
    const { repo } = await load();
    const results = await Promise.allSettled([
      repo.saveDraft({ key: KEY, locale: "mn", value: "A", expectedVersion: 0, actor }),
      repo.saveDraft({ key: KEY, locale: "mn", value: "B", expectedVersion: 0, actor: actor2 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictError);
  });

  it("two concurrent publishes of the same version: exactly one revision and one audit row", async () => {
    const { repo, prisma } = await load();
    const d = await repo.saveDraft({ key: KEY, locale: "mn", value: "A", expectedVersion: 0, actor });
    const results = await Promise.allSettled([
      repo.publish({ key: KEY, locale: "mn", expectedVersion: d.version, actor, audit: () => audit("publish") }),
      repo.publish({ key: KEY, locale: "mn", expectedVersion: d.version, actor: actor2, audit: () => audit("publish") }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await repo.listRevisions(KEY, "mn", 10)).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { entityType: "SiteContent" } })).toBe(1);
  });

  it("publish with no draft is refused; unknown entry is not found", async () => {
    const { repo } = await load();
    await expect(repo.publish({ key: KEY, locale: "mn", expectedVersion: 1, actor, audit: () => audit("publish") })).rejects.toBeInstanceOf(NotFoundError);
    const d = await repo.saveDraft({ key: KEY, locale: "mn", value: "A", expectedVersion: 0, actor });
    const p = await repo.publish({ key: KEY, locale: "mn", expectedVersion: d.version, actor, audit: () => audit("publish") });
    await expect(repo.publish({ key: KEY, locale: "mn", expectedVersion: p.entry.version, actor, audit: () => audit("publish") })).rejects.toBeInstanceOf(ValidationError);
  });

  it("a failing audit insert rolls the whole publish back (nothing live, no revision, draft kept)", async () => {
    const { repo } = await load();
    const d = await repo.saveDraft({ key: KEY, locale: "mn", value: "A", expectedVersion: 0, actor });
    // An action value that is not in the AuditAction enum makes PostgreSQL reject the audit insert inside the transaction.
    await expect(
      repo.publish({ key: KEY, locale: "mn", expectedVersion: d.version, actor, audit: () => ({ ...audit("publish"), action: "NOT_AN_ACTION" as never }) }),
    ).rejects.toThrow();
    const after = await repo.find(KEY, "mn");
    expect(after).toMatchObject({ draftValue: "A", publishedValue: null, version: d.version });
    expect(await repo.listRevisions(KEY, "mn", 10)).toHaveLength(0);
    expect(await repo.findPublished("mn")).toEqual({});
  });

  it("restore → draft only; history is append-only; unpublish falls back but keeps revisions; locales are independent", async () => {
    const { repo } = await load();
    let v = (await repo.saveDraft({ key: KEY, locale: "mn", value: "Нэг", expectedVersion: 0, actor })).version;
    v = (await repo.publish({ key: KEY, locale: "mn", expectedVersion: v, actor, audit: () => audit("publish") })).entry.version;
    v = (await repo.saveDraft({ key: KEY, locale: "mn", value: "Хоёр", expectedVersion: v, actor })).version;
    v = (await repo.publish({ key: KEY, locale: "mn", expectedVersion: v, actor, audit: () => audit("publish") })).entry.version;

    const restored = await repo.restoreToDraft({ key: KEY, locale: "mn", revision: 1, expectedVersion: v, actor: actor2, audit: audit("restore_revision") });
    expect(restored).toMatchObject({ draftValue: "Нэг", publishedValue: "Хоёр" });
    await expect(repo.restoreToDraft({ key: KEY, locale: "mn", revision: 99, expectedVersion: restored.version, actor, audit: audit("restore_revision") })).rejects.toBeInstanceOf(NotFoundError);

    const un = await repo.unpublish({ key: KEY, locale: "mn", expectedVersion: restored.version, actor, audit: audit("unpublish") });
    expect(un.publishedValue).toBeNull();
    expect(await repo.findPublished("mn")).toEqual({});
    expect((await repo.listRevisions(KEY, "mn", 10)).map((r) => r.revision)).toEqual([2, 1]);

    const en = await repo.saveDraft({ key: KEY, locale: "en", value: "English", expectedVersion: 0, actor });
    const enPub = await repo.publish({ key: KEY, locale: "en", expectedVersion: en.version, actor, audit: () => audit("publish") });
    expect(enPub.revision).toBe(1);
    expect(await repo.findPublished("en")).toEqual({ [KEY]: "English" });
    expect(await repo.findPublished("mn")).toEqual({});
  });
});
