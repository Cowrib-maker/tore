"use server";

import { revalidatePath } from "next/cache";

import { getClientIp } from "@/application/common/client-ip";
import { requireActor } from "@/application/common/require-actor";
import { importLegacyHomepageContentUseCase } from "@/application/use-cases/site-content/legacy-homepage-import";
import { UserRole } from "@/domain/enums";
import { DomainError } from "@/domain/errors/domain-error";
import { auditLogRepository, homepageContentRepository, siteContentRepository, userRepository } from "@/infrastructure/repositories";

export type LegacyImportActionResult =
  | { ok: true; imported: number; skippedManaged: number; invalid: number }
  | { ok: false; message: string };

/** Imports saved legacy homepage edits as unpublished drafts. Admin only; never publishes, never deletes. */
export async function importLegacyHomepageContentAction(): Promise<LegacyImportActionResult> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const result = await importLegacyHomepageContentUseCase(
      actor,
      {
        siteContentRepository,
        homepageContentRepository,
        auditLogRepository,
        resolveActorLabel: async (id) => {
          const user = await userRepository.findById(id);
          return user?.name?.trim() || user?.email || id;
        },
      },
      await getClientIp(),
    );
    revalidatePath("/admin/homepage");
    revalidatePath("/admin/content");
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, message: error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED" ? "Таны эрх хүрэхгүй байна." : error.message };
    console.error("legacy homepage import failed", error instanceof Error ? error.message : "unknown error");
    return { ok: false, message: "Импортлож чадсангүй. Дахин оролдоно уу." };
  }
}
