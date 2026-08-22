import type { ActorContext } from "@/application/common/actor-context";
import type { HomepageLandingContent } from "@/domain/entities/homepage-content";
import { AuditAction, UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import type { HomepageTranslatorPort } from "@/domain/ports/homepage-translator";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type { HomepageContentRepository } from "@/domain/repositories/homepage-content-repository";
import { locales, type Locale } from "@/i18n/config";
import { mn as mnDictionary } from "@/i18n/dictionaries/mn";

export type ManageHomepageContentDeps = {
  homepageContentRepository: HomepageContentRepository;
  auditLogRepository: AuditLogRepository;
  homepageTranslator: HomepageTranslatorPort;
};

const SOURCE_LOCALE: Locale = "mn";
const TRANSLATABLE_LOCALES = locales.filter(
  (locale) => locale !== SOURCE_LOCALE,
) as Exclude<Locale, "mn">[];

export type AdminHomepageContentSnapshot = {
  content: HomepageLandingContent;
  updatedAt: Date | null;
};

export async function getAdminHomepageContentUseCase(
  actor: ActorContext,
  deps: Pick<ManageHomepageContentDeps, "homepageContentRepository">,
): Promise<AdminHomepageContentSnapshot> {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }

  const existing = await deps.homepageContentRepository.findByLocale(
    SOURCE_LOCALE,
  );

  return {
    content: existing?.content ?? mnDictionary.landing,
    updatedAt: existing?.updatedAt ?? null,
  };
}

export type SaveHomepageContentResult = {
  content: HomepageLandingContent;
  translated: Exclude<Locale, "mn">[];
  translationError?: string;
};

export async function saveHomepageContentUseCase(
  actor: ActorContext,
  content: HomepageLandingContent,
  deps: ManageHomepageContentDeps,
  ipAddress?: string,
): Promise<SaveHomepageContentResult> {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }

  await deps.homepageContentRepository.upsert(
    SOURCE_LOCALE,
    content,
    actor.userId,
  );

  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action: AuditAction.UPDATE,
    entityType: "HomepageContent",
    entityId: SOURCE_LOCALE,
    metadata: { locale: SOURCE_LOCALE },
    ipAddress,
  });

  if (!deps.homepageTranslator.isConfigured()) {
    return {
      content,
      translated: [],
      translationError: "Орчуулгын тохиргоо (OPENAI_API_KEY) хийгдээгүй байна.",
    };
  }

  try {
    const translations = await deps.homepageTranslator.translate(
      content,
      TRANSLATABLE_LOCALES,
    );

    const translated: Exclude<Locale, "mn">[] = [];
    for (const locale of TRANSLATABLE_LOCALES) {
      const translation = translations[locale];
      if (!translation) continue;
      await deps.homepageContentRepository.upsert(
        locale,
        translation,
        actor.userId,
      );
      await deps.auditLogRepository.create({
        actorUserId: actor.userId,
        action: AuditAction.UPDATE,
        entityType: "HomepageContent",
        entityId: locale,
        metadata: { locale, autoTranslatedFrom: SOURCE_LOCALE },
        ipAddress,
      });
      translated.push(locale);
    }

    return { content, translated };
  } catch (error) {
    console.error("Homepage content auto-translation failed:", error);
    return {
      content,
      translated: [],
      translationError:
        "Монгол хувилбар хадгалагдлаа, гэвч бусад хэл рүү автоматаар орчуулахад алдаа гарлаа.",
    };
  }
}
