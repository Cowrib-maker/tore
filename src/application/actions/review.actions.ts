"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/application/common/action-state";
import { mapActionError } from "@/application/common/map-action-error";
import { requireActor } from "@/application/common/require-actor";
import { submitReviewForActor } from "@/application/use-cases/reviews/submit-review";

const CLIENT_BOOKINGS_PATH = "/client/bookings";

export async function submitReviewAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await submitReviewForActor(actor, {
      bookingId: String(formData.get("bookingId") ?? ""),
      rating: Number(formData.get("rating")),
      comment: String(formData.get("comment") ?? "") || null,
    });
  } catch (error) {
    return mapActionError(error);
  }
  revalidatePath(CLIENT_BOOKINGS_PATH);
  return { success: true };
}
