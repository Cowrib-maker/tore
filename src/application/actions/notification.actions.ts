"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/application/common/action-state";
import { mapActionError } from "@/application/common/map-action-error";
import { enforceRateLimit } from "@/application/common/rate-limit-action";
import { requireActor } from "@/application/common/require-actor";
import { notificationRepository } from "@/infrastructure/repositories";
import { NOTIFICATION_WRITE_RATE_LIMIT } from "@/infrastructure/security/rate-limiter";

export async function markAllNotificationsReadAction(
  _prev: ActionState = {},
  _formData?: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const limited = await enforceRateLimit(
      `notification:write:${actor.userId}`,
      NOTIFICATION_WRITE_RATE_LIMIT,
    );
    if (limited) return limited;
    await notificationRepository.markAllReadForUser(actor.userId);
    revalidatePath("/client/notifications");
    revalidatePath("/lawyer/notifications");
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function markNotificationReadAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const limited = await enforceRateLimit(
      `notification:write:${actor.userId}`,
      NOTIFICATION_WRITE_RATE_LIMIT,
    );
    if (limited) return limited;
    const id = String(formData.get("notificationId") ?? "");
    const note = await notificationRepository.findById(id);
    if (!note || note.userId !== actor.userId) {
      return { error: "Notification not found" };
    }
    await notificationRepository.markRead([id]);
    revalidatePath("/client/notifications");
    revalidatePath("/lawyer/notifications");
    return { success: true };
  } catch (error) {
    return mapActionError(error);
  }
}
