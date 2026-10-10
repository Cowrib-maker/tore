import { ConflictError, NotFoundError, ValidationError } from "@/domain/errors/domain-error";
import type {
  SiteContentActor,
  SiteContentAudit,
  SiteContentEntryRecord,
  SiteContentRepository,
  SiteContentRevisionRecord,
} from "@/domain/repositories/site-content-repository";
import { isSiteContentLocale, type SiteContentLocale } from "@/domain/site-content/registry";
import { prisma } from "@/infrastructure/database/prisma";

type EntryRow = Awaited<ReturnType<typeof prisma.siteContentEntry.findFirstOrThrow>>;

const STALE = "Энэ агуулгыг өөр хүн өөрчилсөн байна. Хуудсаа шинэчлээд дахин оролдоно уу.";

function mapEntry(row: EntryRow): SiteContentEntryRecord {
  if (!isSiteContentLocale(row.locale)) throw new Error(`Unknown site content locale: ${row.locale}`);
  return {
    key: row.key,
    locale: row.locale,
    draftValue: row.draftValue,
    publishedValue: row.publishedValue,
    publishedRevision: row.publishedRevision,
    version: row.version,
    updatedByLabel: row.updatedByLabel,
    updatedAt: row.updatedAt,
    publishedByLabel: row.publishedByLabel,
    publishedAt: row.publishedAt,
  };
}

function mapRevision(row: { key: string; locale: string; revision: number; value: string; createdByLabel: string | null; createdAt: Date }): SiteContentRevisionRecord {
  if (!isSiteContentLocale(row.locale)) throw new Error(`Unknown site content locale: ${row.locale}`);
  return { key: row.key, locale: row.locale, revision: row.revision, value: row.value, createdByLabel: row.createdByLabel, createdAt: row.createdAt };
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function writeAudit(tx: Tx, audit: SiteContentAudit): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorUserId: audit.actorUserId ?? null,
      action: audit.action,
      entityType: audit.entityType,
      entityId: audit.entityId ?? null,
      metadata: audit.metadata as object | undefined,
      ipAddress: audit.ipAddress ?? null,
    },
  });
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

export class PrismaSiteContentRepository implements SiteContentRepository {
  async findAll(): Promise<SiteContentEntryRecord[]> {
    return (await prisma.siteContentEntry.findMany()).map(mapEntry);
  }

  async find(key: string, locale: SiteContentLocale): Promise<SiteContentEntryRecord | null> {
    const row = await prisma.siteContentEntry.findUnique({ where: { key_locale: { key, locale } } });
    return row ? mapEntry(row) : null;
  }

  async findPublished(locale: SiteContentLocale): Promise<Record<string, string>> {
    const rows = await prisma.siteContentEntry.findMany({
      where: { locale, publishedValue: { not: null } },
      select: { key: true, publishedValue: true },
    });
    const out: Record<string, string> = {};
    for (const row of rows) if (row.publishedValue !== null) out[row.key] = row.publishedValue;
    return out;
  }

  async listRevisions(key: string, locale: SiteContentLocale, limit: number): Promise<SiteContentRevisionRecord[]> {
    const rows = await prisma.siteContentRevision.findMany({ where: { key, locale }, orderBy: { revision: "desc" }, take: limit });
    return rows.map(mapRevision);
  }

  async findRevision(key: string, locale: SiteContentLocale, revision: number): Promise<SiteContentRevisionRecord | null> {
    const row = await prisma.siteContentRevision.findUnique({ where: { key_locale_revision: { key, locale, revision } } });
    return row ? mapRevision(row) : null;
  }

  async saveDraft(input: { key: string; locale: SiteContentLocale; value: string; expectedVersion: number; actor: SiteContentActor }): Promise<SiteContentEntryRecord> {
    const { key, locale, value, expectedVersion, actor } = input;
    const stamp = { updatedByUserId: actor.userId, updatedByLabel: actor.label, updatedAt: new Date() };
    if (expectedVersion === 0) {
      try {
        return mapEntry(await prisma.siteContentEntry.create({ data: { key, locale, draftValue: value, version: 1, ...stamp } }));
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError(STALE);
        throw error;
      }
    }
    const result = await prisma.siteContentEntry.updateMany({
      where: { key, locale, version: expectedVersion },
      data: { draftValue: value, version: { increment: 1 }, ...stamp },
    });
    if (result.count !== 1) throw new ConflictError(STALE);
    return this.mustFind(key, locale);
  }

  async publish(input: { key: string; locale: SiteContentLocale; expectedVersion: number; actor: SiteContentActor; audit: (revision: number) => SiteContentAudit }): Promise<{ entry: SiteContentEntryRecord; revision: number }> {
    const { key, locale, expectedVersion, actor } = input;
    return prisma.$transaction(async (tx) => {
      const current = await tx.siteContentEntry.findUnique({ where: { key_locale: { key, locale } } });
      if (!current) throw new NotFoundError("Site content");
      if (current.version !== expectedVersion) throw new ConflictError(STALE);
      if (current.draftValue === null) throw new ValidationError("Нийтлэх ноорог байхгүй байна.");
      const revision = current.revisionCounter + 1;
      const now = new Date();
      const claimed = await tx.siteContentEntry.updateMany({
        where: { key, locale, version: expectedVersion },
        data: {
          publishedValue: current.draftValue,
          publishedRevision: revision,
          revisionCounter: revision,
          draftValue: null,
          version: { increment: 1 },
          publishedByUserId: actor.userId,
          publishedByLabel: actor.label,
          publishedAt: now,
          updatedByUserId: actor.userId,
          updatedByLabel: actor.label,
          updatedAt: now,
        },
      });
      if (claimed.count !== 1) throw new ConflictError(STALE);
      await tx.siteContentRevision.create({
        data: { key, locale, revision, value: current.draftValue, createdByUserId: actor.userId, createdByLabel: actor.label, createdAt: now },
      });
      await writeAudit(tx, input.audit(revision));
      const entry = await tx.siteContentEntry.findUniqueOrThrow({ where: { key_locale: { key, locale } } });
      return { entry: mapEntry(entry), revision };
    });
  }

  async unpublish(input: { key: string; locale: SiteContentLocale; expectedVersion: number; actor: SiteContentActor; audit: SiteContentAudit }): Promise<SiteContentEntryRecord> {
    const { key, locale, expectedVersion, actor } = input;
    await prisma.$transaction(async (tx) => {
      const result = await tx.siteContentEntry.updateMany({
        where: { key, locale, version: expectedVersion, publishedValue: { not: null } },
        data: {
          publishedValue: null,
          publishedRevision: null,
          version: { increment: 1 },
          updatedByUserId: actor.userId,
          updatedByLabel: actor.label,
          updatedAt: new Date(),
        },
      });
      if (result.count !== 1) throw new ConflictError(STALE);
      await writeAudit(tx, input.audit);
    });
    return this.mustFind(key, locale);
  }

  async restoreToDraft(input: { key: string; locale: SiteContentLocale; revision: number; expectedVersion: number; actor: SiteContentActor; audit: SiteContentAudit }): Promise<SiteContentEntryRecord> {
    const { key, locale, expectedVersion, actor } = input;
    if (expectedVersion === 0) throw new ConflictError(STALE);
    await prisma.$transaction(async (tx) => {
      const source = await tx.siteContentRevision.findUnique({ where: { key_locale_revision: { key, locale, revision: input.revision } } });
      if (!source) throw new NotFoundError("Site content revision");
      const result = await tx.siteContentEntry.updateMany({
        where: { key, locale, version: expectedVersion },
        data: { draftValue: source.value, version: { increment: 1 }, updatedByUserId: actor.userId, updatedByLabel: actor.label, updatedAt: new Date() },
      });
      if (result.count !== 1) throw new ConflictError(STALE);
      await writeAudit(tx, input.audit);
    });
    return this.mustFind(key, locale);
  }

  async discardDraft(input: { key: string; locale: SiteContentLocale; expectedVersion: number; actor: SiteContentActor }): Promise<SiteContentEntryRecord> {
    const { key, locale, expectedVersion, actor } = input;
    const result = await prisma.siteContentEntry.updateMany({
      where: { key, locale, version: expectedVersion },
      data: { draftValue: null, version: { increment: 1 }, updatedByUserId: actor.userId, updatedByLabel: actor.label, updatedAt: new Date() },
    });
    if (result.count !== 1) throw new ConflictError(STALE);
    return this.mustFind(key, locale);
  }

  private async mustFind(key: string, locale: SiteContentLocale): Promise<SiteContentEntryRecord> {
    const row = await prisma.siteContentEntry.findUnique({ where: { key_locale: { key, locale } } });
    if (!row) throw new NotFoundError("Site content");
    return mapEntry(row);
  }
}

export const siteContentRepository = new PrismaSiteContentRepository();
