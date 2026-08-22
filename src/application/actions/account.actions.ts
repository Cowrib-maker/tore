"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/application/common/action-state";
import { DEVICE_SESSION_COOKIE } from "@/application/common/device-session-cookie";
import { lawyerEntitlementDeps } from "@/application/common/lawyer-session-http";
import { mapActionError } from "@/application/common/map-action-error";
import { parseWithSchema } from "@/application/common/parse-form";
import { enforceRateLimit } from "@/application/common/rate-limit-action";
import { requireActor } from "@/application/common/require-actor";
import { issueVerificationEmailAfterRegister } from "@/application/services/issue-verification-email";
import { changeEmailUseCase } from "@/application/use-cases/account/change-email";
import { changePasswordUseCase } from "@/application/use-cases/account/change-password";
import { revokeOtherDeviceSessions } from "@/application/use-cases/sessions/manage-device-sessions";
import {
  changeEmailSchema,
  changePasswordSchema,
} from "@/application/validators/account.schema";
import { UserRole } from "@/domain/enums";
import { PROFILE_WRITE_RATE_LIMIT } from "@/infrastructure/security/rate-limiter";
import { userRepository } from "@/infrastructure/repositories";
import { cookies } from "next/headers";

const accountDeps = { userRepository };

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const limited = await enforceRateLimit(
      `account:password:${actor.userId}`,
      PROFILE_WRITE_RATE_LIMIT,
    );
    if (limited) return limited;

    const parsed = parseWithSchema(changePasswordSchema, {
      currentPassword: formData.get("currentPassword") ?? "",
      newPassword: formData.get("newPassword") ?? "",
      confirmPassword: formData.get("confirmPassword") ?? "",
    });
    if (!parsed.ok) return parsed.state;

    await changePasswordUseCase(actor.userId, parsed.data, accountDeps);
    if (actor.role === UserRole.LAWYER) {
      const cookieStore = await cookies();
      const currentSessionId =
        cookieStore.get(DEVICE_SESSION_COOKIE)?.value?.trim() || null;
      await revokeOtherDeviceSessions(
        actor,
        currentSessionId,
        lawyerEntitlementDeps(),
      );
    }
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function changeEmailAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const limited = await enforceRateLimit(
      `account:email:${actor.userId}`,
      PROFILE_WRITE_RATE_LIMIT,
    );
    if (limited) return limited;

    const parsed = parseWithSchema(changeEmailSchema, {
      newEmail: formData.get("newEmail") ?? "",
      currentPassword: formData.get("currentPassword") ?? "",
    });
    if (!parsed.ok) return parsed.state;

    await changeEmailUseCase(actor.userId, parsed.data, accountDeps);
    await issueVerificationEmailAfterRegister(parsed.data.newEmail);

    revalidatePath("/lawyer/profile");
    revalidatePath("/client/profile");
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}
