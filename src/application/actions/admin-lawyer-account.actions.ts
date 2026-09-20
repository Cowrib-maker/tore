"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/application/common/action-state";
import { getClientIp } from "@/application/common/client-ip";
import { mapActionError } from "@/application/common/map-action-error";
import { enforceRateLimit } from "@/application/common/rate-limit-action";
import { requireActor } from "@/application/common/require-actor";
import {
  reinstateLawyerAccountUseCase,
  suspendLawyerAccountUseCase,
} from "@/application/use-cases/admin/manage-lawyer-account";
import { UserRole } from "@/domain/enums";
import { unitOfWork } from "@/infrastructure/database/prisma-unit-of-work";
import { lawyerProfileRepository } from "@/infrastructure/repositories";
import { ADMIN_LAWYER_ACCOUNT_RATE_LIMIT } from "@/infrastructure/security/rate-limiter";

const deps = { lawyerProfileRepository, unitOfWork };

async function guardAdmin(actor: { userId: string }) {
  return enforceRateLimit(
    `admin:lawyer-account:${actor.userId}`,
    ADMIN_LAWYER_ACCOUNT_RATE_LIMIT,
  );
}

export async function adminSuspendLawyerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const limited = await guardAdmin(actor);
    if (limited) return limited;

    const lawyerProfileId = String(formData.get("lawyerProfileId") ?? "");

    await suspendLawyerAccountUseCase(
      actor,
      { lawyerProfileId },
      deps,
      await getClientIp(),
    );

    revalidatePath("/admin/lawyers");
    revalidatePath("/lawyers");
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function adminReinstateLawyerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const limited = await guardAdmin(actor);
    if (limited) return limited;

    const lawyerProfileId = String(formData.get("lawyerProfileId") ?? "");

    await reinstateLawyerAccountUseCase(
      actor,
      { lawyerProfileId },
      deps,
      await getClientIp(),
    );

    revalidatePath("/admin/lawyers");
    revalidatePath("/lawyers");
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}
