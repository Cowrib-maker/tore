"use server";

import { revalidatePath } from "next/cache";

import { getClientIp } from "@/application/common/client-ip";
import { requireActor } from "@/application/common/require-actor";
import {
  getAdminHomepageContentUseCase,
  saveHomepageContentUseCase,
} from "@/application/use-cases/admin/manage-homepage-content";
import { homepageContentSchema } from "@/application/validators/homepage-content.schema";
import type { HomepageLandingContent } from "@/domain/entities/homepage-content";
import { UserRole } from "@/domain/enums";
import {
  auditLogRepository,
  homepageContentRepository,
} from "@/infrastructure/repositories";
import { homepageTranslator } from "@/infrastructure/ai/openai-homepage-translator";

const deps = {
  homepageContentRepository,
  auditLogRepository,
  homepageTranslator,
};

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
    const snapshot = await getAdminHomepageContentUseCase(actor, deps);
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
  | {
      success: true;
      translated: string[];
      translationError?: string;
      updatedAt: string;
    }
  | { success: false; error: string };

export async function adminSaveHomepageContentAction(
  content: HomepageLandingContent,
): Promise<AdminSaveHomepageContentResult> {
  try {
    const actor = await requireActor(UserRole.ADMIN);

    const parsed = homepageContentSchema.safeParse(content);
    if (!parsed.success) {
      return {
        success: false,
        error: "Зарим талбар буруу бөглөгдсөн байна. Дахин шалгана уу.",
      };
    }

    const ipAddress = await getClientIp();
    const result = await saveHomepageContentUseCase(
      actor,
      parsed.data,
      deps,
      ipAddress,
    );

    revalidatePath("/admin/homepage");
    revalidatePath("/");

    return {
      success: true,
      translated: result.translated,
      translationError: result.translationError,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("adminSaveHomepageContentAction failed:", error);
    return {
      success: false,
      error: "Хадгалах явцад алдаа гарлаа. Дахин оролдоно уу.",
    };
  }
}
