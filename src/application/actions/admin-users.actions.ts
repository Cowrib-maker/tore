"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/application/common/action-state";
import { getClientIp } from "@/application/common/client-ip";
import { mapActionError } from "@/application/common/map-action-error";
import { enforceRateLimit } from "@/application/common/rate-limit-action";
import { requireActor } from "@/application/common/require-actor";
import { forceLogoutUserUseCase } from "@/application/use-cases/admin/force-logout-user";
import {
  changeUserRoleUseCase,
  deactivateUserUseCase,
  listUsersUseCase,
  reactivateUserUseCase,
  setUserStatusUseCase,
} from "@/application/use-cases/admin/manage-users";
import { UserRole, UserStatus } from "@/domain/enums";
import { unitOfWork } from "@/infrastructure/database/prisma-unit-of-work";
import { auditLogRepository, userRepository } from "@/infrastructure/repositories";
import {
  ADMIN_FORCE_LOGOUT_RATE_LIMIT,
  ADMIN_USER_MANAGEMENT_RATE_LIMIT,
} from "@/infrastructure/security/rate-limiter";

const deps = { userRepository, auditLogRepository };
const uowDeps = { unitOfWork };

async function guardUserManagement(actor: { userId: string }) {
  return enforceRateLimit(
    `admin:user-management:${actor.userId}`,
    ADMIN_USER_MANAGEMENT_RATE_LIMIT,
  );
}

export async function getAdminUsersList(input: {
  search?: string;
  role?: UserRole;
  status?: UserStatus;
  page: number;
}) {
  const actor = await requireActor(UserRole.ADMIN);
  const limit = 25;
  const offset = (Math.max(1, input.page) - 1) * limit;
  return listUsersUseCase(
    actor,
    {
      search: input.search,
      role: input.role,
      status: input.status,
      limit,
      offset,
    },
    { userRepository },
  );
}

export async function adminSetUserStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const userId = String(formData.get("userId") ?? "");
    const status = String(formData.get("status") ?? "") as UserStatus;

    await setUserStatusUseCase(
      actor,
      { userId, status },
      deps,
      await getClientIp(),
    );

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function adminForceLogoutUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const limited = await enforceRateLimit(
      `admin:force-logout:${actor.userId}`,
      ADMIN_FORCE_LOGOUT_RATE_LIMIT,
    );
    if (limited) return limited;

    const userId = String(formData.get("userId") ?? "");

    await forceLogoutUserUseCase(actor, { userId }, deps, await getClientIp());

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function adminDeactivateUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const limited = await guardUserManagement(actor);
    if (limited) return limited;

    const userId = String(formData.get("userId") ?? "");
    const reasonRaw = formData.get("reason");
    const reason = typeof reasonRaw === "string" ? reasonRaw : undefined;

    await deactivateUserUseCase(
      actor,
      { userId, reason },
      uowDeps,
      await getClientIp(),
    );

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function adminReactivateUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const limited = await guardUserManagement(actor);
    if (limited) return limited;

    const userId = String(formData.get("userId") ?? "");

    await reactivateUserUseCase(actor, { userId }, uowDeps, await getClientIp());

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function adminChangeUserRoleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor(UserRole.ADMIN);
    const limited = await guardUserManagement(actor);
    if (limited) return limited;

    const userId = String(formData.get("userId") ?? "");
    const newRole = String(formData.get("newRole") ?? "") as UserRole;

    await changeUserRoleUseCase(
      actor,
      { userId, newRole },
      uowDeps,
      await getClientIp(),
    );

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}
