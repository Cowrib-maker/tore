import type { ActorContext } from "@/application/common/actor-context";
import { AuditAction, UserRole } from "@/domain/enums";
import { ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors/domain-error";
import type {
  SiteContentActor,
  SiteContentEntryRecord,
  SiteContentRepository,
  SiteContentRevisionRecord,
} from "@/domain/repositories/site-content-repository";
import { SITE_CONTENT_DEFINITIONS, getAvailableSiteContentDefinition } from "@/application/use-cases/site-content/catalog";
import {
  getSiteContentDefault,
  isSiteContentLocale,
  validateSiteContentValue,
  type SiteContentDefinition,
  type SiteContentLocale,
} from "@/domain/site-content/registry";
import { getDictionarySync } from "@/i18n/get-dictionary-sync";

export const SITE_CONTENT_AUDIT_ENTITY = "SiteContent";

export type SiteContentDeps = {
  siteContentRepository: SiteContentRepository;
  /** Resolves the display label stored with revisions (an e-mail or name — a snapshot, kept even if the account is later removed). */
  resolveActorLabel: (userId: string) => Promise<string>;
};

/** Every operation re-checks the role here, independent of whatever the transport layer already did. */
function assertAdmin(actor: ActorContext): void {
  if (actor.role !== UserRole.ADMIN) throw new ForbiddenError();
}

function resolveTarget(key: string, locale: string): { definition: SiteContentDefinition; locale: SiteContentLocale } {
  const definition = getAvailableSiteContentDefinition(key);
  if (!definition) throw new NotFoundError("Site content key");
  if (!isSiteContentLocale(locale)) throw new ValidationError("Дэмжигдээгүй хэл.");
  return { definition, locale };
}

async function actorOf(actor: ActorContext, deps: SiteContentDeps): Promise<SiteContentActor> {
  return { userId: actor.userId, label: await deps.resolveActorLabel(actor.userId) };
}

export type SiteContentLocaleView = {
  locale: SiteContentLocale;
  /** Code-owned text used whenever nothing is published. */
  defaultValue: string;
  publishedValue: string | null;
  draftValue: string | null;
  /** What the editor should show first: draft, else published, else default. */
  editorValue: string;
  /** 0 = the entry does not exist yet. Must be sent back with every write. */
  version: number;
  hasPendingDraft: boolean;
  publishedRevision: number | null;
  publishedAt: Date | null;
  publishedByLabel: string | null;
  updatedAt: Date | null;
  updatedByLabel: string | null;
};

export type SiteContentItemView = {
  definition: SiteContentDefinition;
  locales: Record<SiteContentLocale, SiteContentLocaleView>;
};

function toLocaleView(definition: SiteContentDefinition, locale: SiteContentLocale, entry: SiteContentEntryRecord | null): SiteContentLocaleView {
  const defaultValue = getSiteContentDefault(getDictionarySync(locale), definition) ?? "";
  return {
    locale,
    defaultValue,
    publishedValue: entry?.publishedValue ?? null,
    draftValue: entry?.draftValue ?? null,
    editorValue: entry?.draftValue ?? entry?.publishedValue ?? defaultValue,
    version: entry?.version ?? 0,
    hasPendingDraft: entry?.draftValue != null,
    publishedRevision: entry?.publishedRevision ?? null,
    publishedAt: entry?.publishedAt ?? null,
    updatedAt: entry?.updatedAt ?? null,
    updatedByLabel: entry?.updatedByLabel ?? null,
    publishedByLabel: entry?.publishedByLabel ?? null,
  };
}

function buildItem(definition: SiteContentDefinition, entries: SiteContentEntryRecord[]): SiteContentItemView {
  const pick = (locale: SiteContentLocale) => entries.find((e) => e.key === definition.key && e.locale === locale) ?? null;
  return { definition, locales: { mn: toLocaleView(definition, "mn", pick("mn")), en: toLocaleView(definition, "en", pick("en")) } };
}

export async function listSiteContentUseCase(actor: ActorContext, deps: Pick<SiteContentDeps, "siteContentRepository">): Promise<SiteContentItemView[]> {
  assertAdmin(actor);
  const entries = await deps.siteContentRepository.findAll();
  return SITE_CONTENT_DEFINITIONS.map((definition) => buildItem(definition, entries));
}

export async function getSiteContentItemUseCase(
  actor: ActorContext,
  key: string,
  deps: Pick<SiteContentDeps, "siteContentRepository">,
): Promise<{ item: SiteContentItemView; revisions: Record<SiteContentLocale, SiteContentRevisionRecord[]> }> {
  assertAdmin(actor);
  const { definition } = resolveTarget(key, "mn");
  const [mn, en, revMn, revEn] = await Promise.all([
    deps.siteContentRepository.find(key, "mn"),
    deps.siteContentRepository.find(key, "en"),
    deps.siteContentRepository.listRevisions(key, "mn", 50),
    deps.siteContentRepository.listRevisions(key, "en", 50),
  ]);
  return {
    item: buildItem(definition, [...(mn ? [mn] : []), ...(en ? [en] : [])]),
    revisions: { mn: revMn, en: revEn },
  };
}

type WriteInput = { key: string; locale: string; expectedVersion: number };

function assertVersion(expectedVersion: number): void {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) throw new ValidationError("Хувилбарын дугаар буруу.");
}

export async function saveSiteContentDraftUseCase(
  actor: ActorContext,
  input: WriteInput & { value: string },
  deps: SiteContentDeps,
): Promise<SiteContentEntryRecord> {
  assertAdmin(actor);
  const { definition, locale } = resolveTarget(input.key, input.locale);
  assertVersion(input.expectedVersion);
  const checked = validateSiteContentValue(definition, input.value);
  if (!checked.ok) throw new ValidationError(checked.reason);
  return deps.siteContentRepository.saveDraft({
    key: definition.key,
    locale,
    value: checked.value,
    expectedVersion: input.expectedVersion,
    actor: await actorOf(actor, deps),
  });
}

export async function discardSiteContentDraftUseCase(actor: ActorContext, input: WriteInput, deps: SiteContentDeps): Promise<SiteContentEntryRecord> {
  assertAdmin(actor);
  const { definition, locale } = resolveTarget(input.key, input.locale);
  assertVersion(input.expectedVersion);
  return deps.siteContentRepository.discardDraft({ key: definition.key, locale, expectedVersion: input.expectedVersion, actor: await actorOf(actor, deps) });
}

export async function publishSiteContentUseCase(
  actor: ActorContext,
  input: WriteInput,
  deps: SiteContentDeps,
  ipAddress?: string,
): Promise<{ entry: SiteContentEntryRecord; revision: number }> {
  assertAdmin(actor);
  const { definition, locale } = resolveTarget(input.key, input.locale);
  assertVersion(input.expectedVersion);
  // The audit record is written by the repository inside the same transaction as the change.
  return deps.siteContentRepository.publish({
    key: definition.key,
    locale,
    expectedVersion: input.expectedVersion,
    actor: await actorOf(actor, deps),
    audit: (revision) => ({
      actorUserId: actor.userId,
      action: AuditAction.UPDATE,
      entityType: SITE_CONTENT_AUDIT_ENTITY,
      entityId: `${definition.key}:${locale}`,
      metadata: { event: "publish", key: definition.key, locale, revision },
      ipAddress,
    }),
  });
}

export async function unpublishSiteContentUseCase(actor: ActorContext, input: WriteInput, deps: SiteContentDeps, ipAddress?: string): Promise<SiteContentEntryRecord> {
  assertAdmin(actor);
  const { definition, locale } = resolveTarget(input.key, input.locale);
  assertVersion(input.expectedVersion);
  return deps.siteContentRepository.unpublish({
    key: definition.key,
    locale,
    expectedVersion: input.expectedVersion,
    actor: await actorOf(actor, deps),
    audit: {
      actorUserId: actor.userId,
      action: AuditAction.UPDATE,
      entityType: SITE_CONTENT_AUDIT_ENTITY,
      entityId: `${definition.key}:${locale}`,
      metadata: { event: "unpublish", key: definition.key, locale },
      ipAddress,
    },
  });
}

export async function restoreSiteContentRevisionUseCase(
  actor: ActorContext,
  input: WriteInput & { revision: number },
  deps: SiteContentDeps,
  ipAddress?: string,
): Promise<SiteContentEntryRecord> {
  assertAdmin(actor);
  const { definition, locale } = resolveTarget(input.key, input.locale);
  assertVersion(input.expectedVersion);
  if (!Number.isInteger(input.revision) || input.revision < 1) throw new ValidationError("Хувилбарын дугаар буруу.");
  return deps.siteContentRepository.restoreToDraft({
    key: definition.key,
    locale,
    revision: input.revision,
    expectedVersion: input.expectedVersion,
    actor: await actorOf(actor, deps),
    audit: {
      actorUserId: actor.userId,
      action: AuditAction.UPDATE,
      entityType: SITE_CONTENT_AUDIT_ENTITY,
      entityId: `${definition.key}:${locale}`,
      metadata: { event: "restore_revision", key: definition.key, locale, revision: input.revision },
      ipAddress,
    },
  });
}

/**
 * Text overrides used by the admin PREVIEW: published values, optionally overlaid with unpublished drafts. Read-only — it never
 * writes, and drafts are returned only to an admin (the public loader never sees them).
 */
export async function getPreviewOverridesUseCase(
  actor: ActorContext,
  locale: string,
  mode: "published" | "draft",
  deps: Pick<SiteContentDeps, "siteContentRepository">,
): Promise<Record<string, string>> {
  assertAdmin(actor);
  if (!isSiteContentLocale(locale)) return {};
  const overrides = { ...(await deps.siteContentRepository.findPublished(locale)) };
  if (mode === "draft") {
    for (const entry of await deps.siteContentRepository.findAll()) {
      if (entry.locale === locale && entry.draftValue !== null) overrides[entry.key] = entry.draftValue;
    }
  }
  return overrides;
}
