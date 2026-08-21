"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/application/common/action-state";
import { getClientIp } from "@/application/common/client-ip";
import { mapActionError } from "@/application/common/map-action-error";
import { requireActor } from "@/application/common/require-actor";
import {
  listUsersUseCase,
  setUserStatusUseCase,
} from "@/application/use-cases/admin/manage-users";
import { UserRole, UserStatus } from "@/domain/enums";
import { auditLogRepository, userRepository } from "@/infrastructure/repositories";

const deps = { userRepository, auditLogRepository };

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
