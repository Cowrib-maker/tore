"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/application/common/action-state";
import { mapActionError } from "@/application/common/map-action-error";
import { parseWithSchema } from "@/application/common/parse-form";
import { requireActor } from "@/application/common/require-actor";
import {
  createLanguageUseCase,
  createPracticeAreaUseCase,
  toggleLanguageActiveUseCase,
  togglePracticeAreaActiveUseCase,
  updateLanguageUseCase,
  updatePracticeAreaUseCase,
} from "@/application/use-cases/admin/manage-taxonomy";
import {
  createLanguageSchema,
  createPracticeAreaSchema,
  updateLanguageSchema,
  updatePracticeAreaSchema,
} from "@/application/validators/admin-taxonomy.schema";
import { UserRole } from "@/domain/enums";
import {
  auditLogRepository,
  languageRepository,
  practiceAreaRepository,
} from "@/infrastructure/repositories";

const deps = { practiceAreaRepository, languageRepository, auditLogRepository };

function revalidate() {
  revalidatePath("/admin/taxonomy");
  revalidatePath("/lawyer/profile");
  revalidatePath("/lawyers");
}

export async function adminCreatePracticeAreaAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const parsed = parseWithSchema(createPracticeAreaSchema, {
      slug: formData.get("slug"),
      nameMn: formData.get("nameMn"),
      nameEn: formData.get("nameEn"),
    });
    if (!parsed.ok) return parsed.state;

    await createPracticeAreaUseCase(actor, parsed.data, deps);
    revalidate();
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function adminUpdatePracticeAreaAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const parsed = parseWithSchema(updatePracticeAreaSchema, {
      id: formData.get("id"),
      nameMn: formData.get("nameMn"),
      nameEn: formData.get("nameEn"),
    });
    if (!parsed.ok) return parsed.state;

    await updatePracticeAreaUseCase(actor, parsed.data, deps);
    revalidate();
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function adminTogglePracticeAreaActiveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const id = String(formData.get("id") ?? "");
    const isActive = String(formData.get("isActive") ?? "") === "true";
    await togglePracticeAreaActiveUseCase(actor, { id, isActive }, deps);
    revalidate();
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function adminCreateLanguageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const parsed = parseWithSchema(createLanguageSchema, {
      code: formData.get("code"),
      nameMn: formData.get("nameMn"),
      nameEn: formData.get("nameEn"),
    });
    if (!parsed.ok) return parsed.state;

    await createLanguageUseCase(actor, parsed.data, deps);
    revalidate();
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function adminUpdateLanguageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const parsed = parseWithSchema(updateLanguageSchema, {
      id: formData.get("id"),
      nameMn: formData.get("nameMn"),
      nameEn: formData.get("nameEn"),
    });
    if (!parsed.ok) return parsed.state;

    await updateLanguageUseCase(actor, parsed.data, deps);
    revalidate();
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function adminToggleLanguageActiveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const id = String(formData.get("id") ?? "");
    const isActive = String(formData.get("isActive") ?? "") === "true";
    await toggleLanguageActiveUseCase(actor, { id, isActive }, deps);
    revalidate();
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}
