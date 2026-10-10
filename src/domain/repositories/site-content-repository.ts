import type { CreateAuditLogInput } from "@/domain/entities/audit-log";
import type { SiteContentLocale } from "@/domain/site-content/registry";

export type SiteContentActor = { userId: string; label: string };

export type SiteContentEntryRecord = {
  key: string;
  locale: SiteContentLocale;
  draftValue: string | null;
  publishedValue: string | null;
  publishedRevision: number | null;
  version: number;
  updatedByLabel: string | null;
  updatedAt: Date;
  publishedByLabel: string | null;
  publishedAt: Date | null;
};

export type SiteContentRevisionRecord = {
  key: string;
  locale: SiteContentLocale;
  revision: number;
  value: string;
  createdByLabel: string | null;
  createdAt: Date;
};

/**
 * Audit record written in the SAME transaction as the change: if it cannot be stored, the change is not applied
 * (no live content without a trail, and no success reported for a rolled-back write).
 */
export type SiteContentAudit = CreateAuditLogInput;

/**
 * Every mutating method is conditional on `expectedVersion` (0 = "the entry does not exist yet") and throws ConflictError when the
 * stored version differs, so a stale form can never overwrite a newer edit. Methods return the new stored state.
 */
export interface SiteContentRepository {
  findAll(): Promise<SiteContentEntryRecord[]>;
  find(key: string, locale: SiteContentLocale): Promise<SiteContentEntryRecord | null>;
  /** Published values only, by key, for one locale. */
  findPublished(locale: SiteContentLocale): Promise<Record<string, string>>;
  listRevisions(key: string, locale: SiteContentLocale, limit: number): Promise<SiteContentRevisionRecord[]>;
  findRevision(key: string, locale: SiteContentLocale, revision: number): Promise<SiteContentRevisionRecord | null>;

  saveDraft(input: { key: string; locale: SiteContentLocale; value: string; expectedVersion: number; actor: SiteContentActor }): Promise<SiteContentEntryRecord>;
  /** Publishes the current draft: writes an immutable revision and makes it live, atomically. */
  publish(input: { key: string; locale: SiteContentLocale; expectedVersion: number; actor: SiteContentActor; audit: (revision: number) => SiteContentAudit }): Promise<{ entry: SiteContentEntryRecord; revision: number }>;
  /** Stops serving the override (public site falls back to the code default). Revisions are kept. */
  unpublish(input: { key: string; locale: SiteContentLocale; expectedVersion: number; actor: SiteContentActor; audit: SiteContentAudit }): Promise<SiteContentEntryRecord>;
  /** Loads an earlier revision into the DRAFT (not live until published). */
  restoreToDraft(input: { key: string; locale: SiteContentLocale; revision: number; expectedVersion: number; actor: SiteContentActor; audit: SiteContentAudit }): Promise<SiteContentEntryRecord>;
  discardDraft(input: { key: string; locale: SiteContentLocale; expectedVersion: number; actor: SiteContentActor }): Promise<SiteContentEntryRecord>;
}
