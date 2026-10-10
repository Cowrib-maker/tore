import { ConflictError, NotFoundError, ValidationError } from "@/domain/errors/domain-error";
import type { CreateAuditLogInput } from "@/domain/entities/audit-log";
import type {
  SiteContentActor,
  SiteContentAudit,
  SiteContentEntryRecord,
  SiteContentRepository,
  SiteContentRevisionRecord,
} from "@/domain/repositories/site-content-repository";
import type { SiteContentLocale } from "@/domain/site-content/registry";

const STALE = "stale";

/**
 * In-memory implementation of the repository CONTRACT (conditional writes, atomic audit). The real Prisma implementation is checked
 * against a real PostgreSQL in site-content-prisma-repository.db.test.ts.
 */
export class FakeSiteContentRepository implements SiteContentRepository {
  entries = new Map<string, SiteContentEntryRecord & { revisionCounter: number }>();
  revisions: SiteContentRevisionRecord[] = [];
  audits: CreateAuditLogInput[] = [];
  /** When set, the audit write fails and the whole operation must roll back. */
  failAudit = false;
  writes = 0;

  private id(key: string, locale: SiteContentLocale) {
    return `${key}|${locale}`;
  }

  private commitAudit(audit: SiteContentAudit) {
    if (this.failAudit) throw new Error("audit store down");
    this.audits.push(audit);
  }

  async findAll() {
    return [...this.entries.values()].map((e) => ({ ...e }));
  }
  async find(key: string, locale: SiteContentLocale) {
    const e = this.entries.get(this.id(key, locale));
    return e ? { ...e } : null;
  }
  async findPublished(locale: SiteContentLocale) {
    const out: Record<string, string> = {};
    for (const e of this.entries.values()) if (e.locale === locale && e.publishedValue !== null) out[e.key] = e.publishedValue;
    return out;
  }
  async listRevisions(key: string, locale: SiteContentLocale, limit: number) {
    return this.revisions.filter((r) => r.key === key && r.locale === locale).sort((a, b) => b.revision - a.revision).slice(0, limit);
  }
  async findRevision(key: string, locale: SiteContentLocale, revision: number) {
    return this.revisions.find((r) => r.key === key && r.locale === locale && r.revision === revision) ?? null;
  }

  private stamp(actor: SiteContentActor) {
    return { updatedByLabel: actor.label, updatedAt: new Date() };
  }

  async saveDraft(input: { key: string; locale: SiteContentLocale; value: string; expectedVersion: number; actor: SiteContentActor }) {
    const id = this.id(input.key, input.locale);
    const current = this.entries.get(id);
    if (input.expectedVersion === 0) {
      if (current) throw new ConflictError(STALE);
      const created = { key: input.key, locale: input.locale, draftValue: input.value, publishedValue: null, publishedRevision: null, version: 1, publishedByLabel: null, publishedAt: null, revisionCounter: 0, ...this.stamp(input.actor) };
      this.entries.set(id, created);
      this.writes += 1;
      return { ...created };
    }
    if (!current || current.version !== input.expectedVersion) throw new ConflictError(STALE);
    const next = { ...current, draftValue: input.value, version: current.version + 1, ...this.stamp(input.actor) };
    this.entries.set(id, next);
    this.writes += 1;
    return { ...next };
  }

  async publish(input: { key: string; locale: SiteContentLocale; expectedVersion: number; actor: SiteContentActor; audit: (revision: number) => SiteContentAudit }) {
    const id = this.id(input.key, input.locale);
    const current = this.entries.get(id);
    if (!current) throw new NotFoundError("Site content");
    if (current.version !== input.expectedVersion) throw new ConflictError(STALE);
    if (current.draftValue === null) throw new ValidationError("no draft");
    const revision = current.revisionCounter + 1;
    this.commitAudit(input.audit(revision)); // throws => nothing below happens (rollback)
    const now = new Date();
    this.revisions.push({ key: input.key, locale: input.locale, revision, value: current.draftValue, createdByLabel: input.actor.label, createdAt: now });
    const next = {
      ...current,
      publishedValue: current.draftValue,
      publishedRevision: revision,
      revisionCounter: revision,
      draftValue: null,
      version: current.version + 1,
      publishedByLabel: input.actor.label,
      publishedAt: now,
      updatedByLabel: input.actor.label,
      updatedAt: now,
    };
    this.entries.set(id, next);
    this.writes += 1;
    return { entry: { ...next }, revision };
  }

  async unpublish(input: { key: string; locale: SiteContentLocale; expectedVersion: number; actor: SiteContentActor; audit: SiteContentAudit }) {
    const id = this.id(input.key, input.locale);
    const current = this.entries.get(id);
    if (!current || current.version !== input.expectedVersion || current.publishedValue === null) throw new ConflictError(STALE);
    this.commitAudit(input.audit);
    const next = { ...current, publishedValue: null, publishedRevision: null, version: current.version + 1, ...this.stamp(input.actor) };
    this.entries.set(id, next);
    this.writes += 1;
    return { ...next };
  }

  async restoreToDraft(input: { key: string; locale: SiteContentLocale; revision: number; expectedVersion: number; actor: SiteContentActor; audit: SiteContentAudit }) {
    const id = this.id(input.key, input.locale);
    const current = this.entries.get(id);
    if (!current || current.version !== input.expectedVersion) throw new ConflictError(STALE);
    const source = await this.findRevision(input.key, input.locale, input.revision);
    if (!source) throw new NotFoundError("Site content revision");
    this.commitAudit(input.audit);
    const next = { ...current, draftValue: source.value, version: current.version + 1, ...this.stamp(input.actor) };
    this.entries.set(id, next);
    this.writes += 1;
    return { ...next };
  }

  async discardDraft(input: { key: string; locale: SiteContentLocale; expectedVersion: number; actor: SiteContentActor }) {
    const id = this.id(input.key, input.locale);
    const current = this.entries.get(id);
    if (!current || current.version !== input.expectedVersion) throw new ConflictError(STALE);
    const next = { ...current, draftValue: null, version: current.version + 1, ...this.stamp(input.actor) };
    this.entries.set(id, next);
    this.writes += 1;
    return { ...next };
  }
}
