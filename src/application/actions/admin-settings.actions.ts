"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/application/common/action-state";
import { mapActionError } from "@/application/common/map-action-error";
import { requireActor } from "@/application/common/require-actor";
import { updatePlatformSettingUseCase } from "@/application/use-cases/admin/manage-settings";
import { UserRole } from "@/domain/enums";
import {
  auditLogRepository,
  platformSettingRepository,
} from "@/infrastructure/repositories";

const deps = { platformSettingRepository, auditLogRepository };

export async function adminUpdateSettingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const key = String(formData.get("key") ?? "");
    const value = String(formData.get("value") ?? "");

    await updatePlatformSettingUseCase(actor, { key, value }, deps);
    revalidatePath("/admin/settings");
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}
