"use client";

import { useActionState } from "react";

import type { ActionState } from "@/application/actions/auth.actions";
import { respondBookingAction } from "@/application/actions/marketplace.actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Booking } from "@/domain/entities/booking";
import { BookingStatus } from "@/domain/enums";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

const initialState: ActionState = {};

type BookingActionsCopy = MarketplaceDictionary["bookingActions"] &
  Pick<MarketplaceDictionary["common"], "saving">;

export function LawyerBookingActions({
  booking,
  copy,
}: {
  booking: Booking;
  copy: BookingActionsCopy;
}) {
  const [state, formAction, pending] = useActionState(
    respondBookingAction,
    initialState,
  );

  if (booking.status !== BookingStatus.PENDING_ACCEPTANCE) {
    return null;
  }

  return (
    <div className="space-y-3 border-t pt-3">
      {state.error && (
        <div
          id="lawyer-booking-actions-error"
          role="alert"
          aria-live="assertive"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
          {copy.success}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <form action={formAction}>
          <input type="hidden" name="bookingId" value={booking.id} />
          <input type="hidden" name="decision" value="ACCEPT" />
          <Button
            type="submit"
            size="sm"
            className="bg-[#0F3D33] text-white hover:bg-[#0F3D33]/90"
            disabled={pending}
          >
            {pending ? copy.saving : copy.accept}
          </Button>
        </form>
      </div>
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="bookingId" value={booking.id} />
        <input type="hidden" name="decision" value="REJECT" />
        <Label htmlFor={`decline-${booking.id}`}>{copy.declineReason}</Label>
        <textarea
          id={`decline-${booking.id}`}
          name="declineReason"
          required
          minLength={3}
          rows={2}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder={copy.declineReasonPh}
          aria-invalid={Boolean(state.error)}
          aria-describedby={
            state.error ? "lawyer-booking-actions-error" : undefined
          }
        />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? copy.saving : copy.decline}
        </Button>
      </form>
    </div>
  );
}
