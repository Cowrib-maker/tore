"use server";

import { revalidatePath, updateTag } from "next/cache";

import { getClientIp } from "@/application/common/client-ip";
import { requireActor } from "@/application/common/require-actor";
import {
  discardSiteContentDraftUseCase,
  publishSiteContentUseCase,
  restoreSiteContentRevisionUseCase,
  saveSiteContentDraftUseCase,
  unpublishSiteContentUseCase,
  type SiteContentDeps,
} from "@/application/use-cases/site-content/manage-site-content";
import { SITE_CONTENT_CACHE_TAG } from "@/application/use-cases/site-content/published-site-content";
import { UserRole } from "@/domain/enums";
import { DomainError } from "@/domain/errors/domain-error";
import { siteContentRepository, userRepository } from "@/infrastructure/repositories";

const deps: SiteContentDeps = {
  siteContentRepository,
  resolveActorLabel: async (userId) => {
    const user = await userRepository.findById(userId);
    return user?.name?.trim() || user?.email || userId;
  },
};

export type SiteContentActionResult =
  | { ok: true; version: number; publishedRevision?: number | null }
  | { ok: false; code: "unauthorized" | "forbidden" | "validation" | "conflict" | "not_found" | "error"; message: string };

function failure(error: unknown): Extract<SiteContentActionResult, { ok: false }> {
  if (error instanceof DomainError) {
    const code =
      error.code === "UNAUTHORIZED" ? "unauthorized"
      : error.code === "FORBIDDEN" ? "forbidden"
      : error.code === "VALIDATION_ERROR" ? "validation"
      : error.code === "CONFLICT" ? "conflict"
      : error.code === "NOT_FOUND" ? "not_found"
      : "error";
    // Only validation/conflict messages are authored for display; the rest get fixed text so no internals leak.
    if (code === "validation" || code === "conflict") return { ok: false, code, message: error.message };
    if (code === "unauthorized") return { ok: false, code, message: "Нэвтэрнэ үү." };
    if (code === "forbidden") return { ok: false, code, message: "Таны эрх хүрэхгүй байна." };
    if (code === "not_found") return { ok: false, code, message: "Олдсонгүй." };
  }
  console.error("admin site content action failed", error instanceof Error ? error.message : "unknown error");
  return { ok: false, code: "error", message: "Хадгалж чадсангүй. Дахин оролдоно уу." };
}

/** Expires the cached public text and the pages that render it. Only called after the write AND its audit record succeeded. */
function refreshPublicContent(): void {
  updateTag(SITE_CONTENT_CACHE_TAG);
  revalidatePath("/");
}

export async function saveSiteContentDraftAction(input: { key: string; locale: string; value: string; expectedVersion: number }): Promise<SiteContentActionResult> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const entry = await saveSiteContentDraftUseCase(actor, input, deps);
    revalidatePath("/admin/content");
    return { ok: true, version: entry.version };
  } catch (error) {
    return failure(error);
  }
}

export async function discardSiteContentDraftAction(input: { key: string; locale: string; expectedVersion: number }): Promise<SiteContentActionResult> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const entry = await discardSiteContentDraftUseCase(actor, input, deps);
    revalidatePath("/admin/content");
    return { ok: true, version: entry.version };
  } catch (error) {
    return failure(error);
  }
}

export async function publishSiteContentAction(input: { key: string; locale: string; expectedVersion: number }): Promise<SiteContentActionResult> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const { entry, revision } = await publishSiteContentUseCase(actor, input, deps, await getClientIp());
    refreshPublicContent();
    revalidatePath("/admin/content");
    return { ok: true, version: entry.version, publishedRevision: revision };
  } catch (error) {
    return failure(error);
  }
}

export async function unpublishSiteContentAction(input: { key: string; locale: string; expectedVersion: number }): Promise<SiteContentActionResult> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const entry = await unpublishSiteContentUseCase(actor, input, deps, await getClientIp());
    refreshPublicContent();
    revalidatePath("/admin/content");
    return { ok: true, version: entry.version };
  } catch (error) {
    return failure(error);
  }
}

export async function restoreSiteContentRevisionAction(input: { key: string; locale: string; revision: number; expectedVersion: number }): Promise<SiteContentActionResult> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const entry = await restoreSiteContentRevisionUseCase(actor, input, deps, await getClientIp());
    revalidatePath("/admin/content");
    return { ok: true, version: entry.version };
  } catch (error) {
    return failure(error);
  }
}
