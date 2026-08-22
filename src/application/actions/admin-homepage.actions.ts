"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/application/common/action-state";
import { getClientIp } from "@/application/common/client-ip";
import { mapActionError } from "@/application/common/map-action-error";
import { requireActor } from "@/application/common/require-actor";
import {
  clearHomepageSectionImageUseCase,
  listHomepageSectionsUseCase,
  setHomepageSectionImageUseCase,
} from "@/application/use-cases/admin/manage-homepage";
import {
  HOMEPAGE_IMAGE_ALLOWED_TYPES,
  HOMEPAGE_IMAGE_MAX_BYTES,
  clearHomepageSectionImageSchema,
  setHomepageSectionImageSchema,
} from "@/application/validators/homepage.schema";
import type { HomepageSection } from "@/domain/entities/homepage-section";
import { UserRole } from "@/domain/enums";
import {
  auditLogRepository,
  homepageSectionRepository,
} from "@/infrastructure/repositories";
import { getFileStorage } from "@/infrastructure/storage";
import { buildPublicHomepageImagePath } from "@/infrastructure/storage/file-access";

const deps = {
  homepageSectionRepository,
  auditLogRepository,
  fileStorage: getFileStorage(),
};

export type HomepageImageActionState = ActionState & {
  imageUrl?: string | null;
};

export async function getAdminHomepageSections(): Promise<
  | { status: "unauthorized" }
  | { status: "ok"; sections: (HomepageSection & { imageUrl: string | null })[] }
> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const sections = await listHomepageSectionsUseCase(actor, deps);
    return {
      status: "ok",
      sections: sections.map((section) => ({
        ...section,
        imageUrl: section.imageKey
          ? buildPublicHomepageImagePath(section.imageKey)
          : null,
      })),
    };
  } catch {
    return { status: "unauthorized" };
  }
}

export async function adminSetHomepageSectionImageAction(
  _prev: HomepageImageActionState,
  formData: FormData,
): Promise<HomepageImageActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const parsed = setHomepageSectionImageSchema.safeParse({
      key: formData.get("key") ?? "",
    });
    if (!parsed.success) {
      return { error: "Invalid section" };
    }

    const file = formData.get("image");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Image file is required" };
    }
    if (file.size > HOMEPAGE_IMAGE_MAX_BYTES) {
      return { error: "Image must be 5MB or smaller" };
    }
    if (
      !HOMEPAGE_IMAGE_ALLOWED_TYPES.includes(
        file.type as (typeof HOMEPAGE_IMAGE_ALLOWED_TYPES)[number],
      )
    ) {
      return { error: "Image must be JPEG, PNG, or WebP" };
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const ipAddress = await getClientIp();
    const section = await setHomepageSectionImageUseCase(
      actor,
      parsed.data,
      { fileName: file.name || "image.jpg", contentType: file.type, body: buffer },
      deps,
      ipAddress,
    );

    revalidatePath("/admin/homepage");
    revalidatePath("/");
    return {
      success: true,
      imageUrl: section.imageKey
        ? buildPublicHomepageImagePath(section.imageKey)
        : null,
    };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function adminClearHomepageSectionImageAction(
  _prev: HomepageImageActionState,
  formData: FormData,
): Promise<HomepageImageActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const parsed = clearHomepageSectionImageSchema.safeParse({
      key: formData.get("key") ?? "",
    });
    if (!parsed.success) {
      return { error: "Invalid section" };
    }

    const ipAddress = await getClientIp();
    await clearHomepageSectionImageUseCase(actor, parsed.data, deps, ipAddress);

    revalidatePath("/admin/homepage");
    revalidatePath("/");
    return { success: true, imageUrl: null };
  } catch (error) {
    return mapActionError(error);
  }
}
