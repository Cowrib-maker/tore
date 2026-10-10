import type { ActorContext } from "@/application/common/actor-context";
import { SITE_CONTENT_DEFINITIONS } from "@/application/use-cases/site-content/catalog";
import { SITE_CONTENT_AUDIT_ENTITY, type SiteContentDeps } from "@/application/use-cases/site-content/manage-site-content";
import { AuditAction, UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type { HomepageContentRepository } from "@/domain/repositories/homepage-content-repository";
import { ConflictError } from "@/domain/errors/domain-error";
import {
  getSiteContentDefault,
  isSiteContentLocale,
  validateSiteContentValue,
  type SiteContentLocale,
} from "@/domain/site-content/registry";
import { getDictionarySync } from "@/i18n/get-dictionary-sync";

/**
 * The retired /admin/homepage editor stored a whole `landing` dictionary per locale in `homepage_contents`. The live site never read it.
 * This module finds the saved edits that map onto keys of the current content system and imports them as UNPUBLISHED DRAFTS, so an
 * administrator reviews and publishes them. Nothing is deleted or changed in `homepage_contents`; nothing goes live by itself.
 */
export type LegacyImportDeps = Pick<SiteContentDeps, "siteContentRepository" | "resolveActorLabel"> & {
  homepageContentRepository: HomepageContentRepository;
  auditLogRepository: AuditLogRepository;
};

export type LegacyImportRow = {
  key: string;
  locale: SiteContentLocale;
  legacyValue: string;
  builtInValue: string;
  /** importable: becomes a draft. managed: the key already has a draft/published value, left untouched. invalid: fails validation. */
  status: "importable" | "managed" | "invalid";
  reason?: string;
};

export type LegacyImportReport = {
  rows: LegacyImportRow[];
  /** Saved legacy edits (leaf fields that differ from the built-in text) with no key in the current system. Kept in the database, not shown on the live site. */
  unmappedChangedFields: number;
  legacyLocalesFound: string[];
};

function readPath(root: unknown, path: string): unknown {
  let current: unknown = root;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function leafStrings(value: unknown, prefix = ""): Array<[string, string]> {
  if (typeof value === "string") return [[prefix, value]];
  if (Array.isArray(value)) return value.flatMap((item, i) => leafStrings(item, prefix ? `${prefix}.${i}` : String(i)));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => leafStrings(v, prefix ? `${prefix}.${k}` : k));
  }
  return [];
}

function assertAdmin(actor: ActorContext): void {
  if (actor.role !== UserRole.ADMIN) throw new ForbiddenError();
}

export async function buildLegacyImportReportUseCase(actor: ActorContext, deps: Pick<LegacyImportDeps, "siteContentRepository" | "homepageContentRepository">): Promise<LegacyImportReport> {
  assertAdmin(actor);
  const [legacy, entries] = await Promise.all([deps.homepageContentRepository.findAll(), deps.siteContentRepository.findAll()]);
  const rows: LegacyImportRow[] = [];
  let unmapped = 0;

  for (const record of legacy) {
    if (!isSiteContentLocale(record.locale)) {
      // Machine-translated ko/zh copies: preserved in the table, not importable (those locales are not editable here).
      unmapped += leafStrings(record.content).filter(([path, value]) => value !== readPath(getDictionarySync(record.locale).landing, path)).length;
      continue;
    }
    const locale = record.locale;
    const builtInLanding = getDictionarySync(locale).landing;
    const handled = new Set<string>();
    for (const definition of SITE_CONTENT_DEFINITIONS.filter((d) => d.dictionaryPath.startsWith("landing."))) {
      const legacyPath = definition.dictionaryPath.slice("landing.".length);
      const legacyValue = readPath(record.content, legacyPath);
      if (typeof legacyValue !== "string") continue;
      handled.add(legacyPath);
      const builtInValue = getSiteContentDefault(getDictionarySync(locale), definition) ?? "";
      if (legacyValue === builtInValue) continue;
      const existing = entries.find((e) => e.key === definition.key && e.locale === locale);
      const checked = validateSiteContentValue(definition, legacyValue);
      const status: LegacyImportRow["status"] = existing && (existing.draftValue !== null || existing.publishedValue !== null) ? "managed" : checked.ok ? "importable" : "invalid";
      rows.push({
        key: definition.key,
        locale,
        legacyValue,
        builtInValue,
        status,
        ...(checked.ok ? {} : { reason: checked.reason }),
      });
    }
    for (const [path, value] of leafStrings(record.content)) {
      if (!handled.has(path) && value !== readPath(builtInLanding, path)) unmapped += 1;
    }
  }
  return { rows, unmappedChangedFields: unmapped, legacyLocalesFound: legacy.map((r) => r.locale) };
}

export async function importLegacyHomepageContentUseCase(
  actor: ActorContext,
  deps: LegacyImportDeps,
  ipAddress?: string,
): Promise<{ imported: number; skippedManaged: number; invalid: number }> {
  assertAdmin(actor);
  const report = await buildLegacyImportReportUseCase(actor, deps);
  const label = await deps.resolveActorLabel(actor.userId);
  let imported = 0;
  for (const row of report.rows.filter((r) => r.status === "importable")) {
    try {
      // expectedVersion 0 = "create only": an entry that appeared meanwhile is never overwritten.
      await deps.siteContentRepository.saveDraft({ key: row.key, locale: row.locale, value: row.legacyValue, expectedVersion: 0, actor: { userId: actor.userId, label } });
      imported += 1;
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
    }
  }
  if (imported > 0) {
    await deps.auditLogRepository.create({
      actorUserId: actor.userId,
      action: AuditAction.UPDATE,
      entityType: SITE_CONTENT_AUDIT_ENTITY,
      entityId: "legacy-homepage-import",
      metadata: { event: "legacy_import", imported, keys: report.rows.filter((r) => r.status === "importable").map((r) => `${r.key}:${r.locale}`) },
      ipAddress,
    });
  }
  return {
    imported,
    skippedManaged: report.rows.filter((r) => r.status === "managed").length,
    invalid: report.rows.filter((r) => r.status === "invalid").length,
  };
}
