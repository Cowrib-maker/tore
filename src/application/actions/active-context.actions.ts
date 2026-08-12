"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import type { ActionState } from "@/application/common/action-state";
import {
  ACTIVE_CONTEXT_COOKIE,
  ACTIVE_CONTEXT_COOKIE_MAX_AGE,
} from "@/application/common/active-context-cookie";
import { serializeActiveContextSelection } from "@/application/common/active-context-selection";
import { mapActionError } from "@/application/common/map-action-error";
import { requireActor } from "@/application/common/require-actor";
import { switchActiveContextUseCase } from "@/application/use-cases/active-context/switch-active-context";
import { ActiveContextType } from "@/domain/enums";
import {
  organizationRepository,
  tenantRepository,
} from "@/infrastructure/repositories";

const deps = {
  tenantRepository,
  organizationRepository,
};

/**
 * Switch Active Context selection.
 * Accepts only `personal` or an organizationId — never tenantId/membershipId.
 */
export async function switchActiveContextAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const targetRaw = String(formData.get("target") ?? "").trim();

    const target =
      targetRaw === "personal"
        ? ({ type: ActiveContextType.PERSONAL } as const)
        : targetRaw.startsWith("org:")
          ? ({
              type: ActiveContextType.ORGANIZATION,
              organizationId: targetRaw.slice(4),
            } as const)
          : null;

    if (!target) {
      return { error: "Invalid context selection." };
    }
    if (
      target.type === ActiveContextType.ORGANIZATION &&
      (target.organizationId.length < 8 ||
        !/^[a-zA-Z0-9_-]+$/.test(target.organizationId))
    ) {
      return { error: "Invalid organization." };
    }

    await switchActiveContextUseCase(actor, target, deps);

    const store = await cookies();
    store.set(
      ACTIVE_CONTEXT_COOKIE,
      serializeActiveContextSelection(target),
      {
        path: "/",
        maxAge: ACTIVE_CONTEXT_COOKIE_MAX_AGE,
        sameSite: "lax",
        httpOnly: true,
      },
    );

    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}
