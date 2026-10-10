"use server";

import { requireActor } from "@/application/common/require-actor";
import { getAdminHomepageContentUseCase } from "@/application/use-cases/admin/manage-homepage-content";
import type { HomepageLandingContent } from "@/domain/entities/homepage-content";
import { UserRole } from "@/domain/enums";
import { homepageContentRepository } from "@/infrastructure/repositories";

export async function getAdminHomepageContentAction(): Promise<
  | { status: "unauthorized" }
  | {
      status: "ok";
      content: HomepageLandingContent;
      updatedAt: string | null;
    }
> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const snapshot = await getAdminHomepageContentUseCase(actor, { homepageContentRepository });
    return {
      status: "ok",
      content: snapshot.content,
      updatedAt: snapshot.updatedAt ? snapshot.updatedAt.toISOString() : null,
    };
  } catch (error) {
    console.error("getAdminHomepageContentAction failed:", error);
    return { status: "unauthorized" };
  }
}

export type AdminSaveHomepageContentResult =
  | { success: true; translated: string[]; translationError?: string; updatedAt: string }
  | { success: false; error: string };

/**
 * RETIRED. The old homepage editor saved overrides the live site never read. Saving through it would silently do nothing for visitors,
 * so the write path is closed; use /admin/content. Previously saved rows are untouched (see legacy-homepage-import.ts).
 */
export async function adminSaveHomepageContentAction(
  content: HomepageLandingContent,
): Promise<AdminSaveHomepageContentResult> {
  void content;
  await requireActor(UserRole.ADMIN).catch(() => null);
  return {
    success: false,
    error: "Энэ засварлагч хаагдсан. Нүүр хуудасны текстийг «Вэб сайтын агуулга» (/admin/content) хэсгээс засна уу.",
  };
}
