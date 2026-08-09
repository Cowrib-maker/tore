"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/application/actions/auth.actions";
import { getSessionUser } from "@/application/actions/auth.actions";
import { mapActionError } from "@/application/common/map-action-error";
import { UnauthorizedError } from "@/domain/errors/domain-error";
import { notificationRepository } from "@/infrastructure/repositories";
import {
  NOTIFICATION_WRITE_RATE_LIMIT,
  consumeRateLimit,
} from "@/infrastructure/security/rate-limiter";

function mapError(error: unknown): ActionState {
  return mapActionError(error);
}

function tooManyWrites(retryAfterSeconds: number): ActionState {
  return {
    error: `Too many requests. Try again in ${retryAfterSeconds} seconds.`,
  };
}

export async function markAllNotificationsReadAction(
  _prev: ActionState = {},
  _formData?: FormData,
): Promise<ActionState> {
  try {
    const session = await getSessionUser();
    if (!session?.user?.id) throw new UnauthorizedError();
    const rate = await consumeRateLimit(
      `notification:write:${session.user.id}`,
      NOTIFICATION_WRITE_RATE_LIMIT.limit,
      NOTIFICATION_WRITE_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) return tooManyWrites(rate.retryAfterSeconds);
    await notificationRepository.markAllReadForUser(session.user.id);
    revalidatePath("/client/notifications");
    revalidatePath("/lawyer/notifications");
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function markNotificationReadAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await getSessionUser();
    if (!session?.user?.id) throw new UnauthorizedError();
    const rate = await consumeRateLimit(
      `notification:write:${session.user.id}`,
      NOTIFICATION_WRITE_RATE_LIMIT.limit,
      NOTIFICATION_WRITE_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) return tooManyWrites(rate.retryAfterSeconds);
    const id = String(formData.get("notificationId") ?? "");
    const note = await notificationRepository.findById(id);
    if (!note || note.userId !== session.user.id) {
      return { error: "Notification not found" };
    }
    await notificationRepository.markRead([id]);
    revalidatePath("/client/notifications");
    revalidatePath("/lawyer/notifications");
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}
