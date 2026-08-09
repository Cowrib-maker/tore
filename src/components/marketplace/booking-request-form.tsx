"use client";

import { useActionState } from "react";

import type { ActionState } from "@/application/actions/auth.actions";
import { createBookingRequestAction } from "@/application/actions/marketplace.actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ConsultationOffering } from "@/domain/entities/consultation-offering";
import type { PracticeArea } from "@/domain/entities/taxonomy";
import type { InstantSlot } from "@/domain/value-objects/time-slot";
import type { Locale } from "@/i18n/config";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";
import { formatDateTimeUtc } from "@/lib/format-labels";
import {
  localizedOfferingTitle,
  localizedTaxonomyName,
} from "@/lib/localized-content";

const initialState: ActionState = {};

type BookingRequestCopy = MarketplaceDictionary["bookingRequest"] &
  Pick<
    MarketplaceDictionary["common"],
    "submitting" | "selectPlaceholder" | "minutesSuffix" | "utc"
  >;

export function BookingRequestForm({
  lawyerSlug,
  offerings,
  slots,
  practiceAreas,
  copy,
  locale,
}: {
  lawyerSlug: string;
  offerings: ConsultationOffering[];
  slots: InstantSlot[];
  practiceAreas: PracticeArea[];
  copy: BookingRequestCopy;
  locale: Locale;
}) {
  const [state, formAction, pending] = useActionState(
    createBookingRequestAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="lawyerSlug" value={lawyerSlug} />
      {state.error && (
        <div
          id="booking-form-error"
          role="alert"
          aria-live="assertive"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}
      {state.success && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800"
        >
          {copy.success}
          {state.message ? ` (${state.message})` : ""}. {copy.successTrack}
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="offeringId">{copy.offering}</Label>
        <select
          id="offeringId"
          name="offeringId"
          required
          aria-invalid={Boolean(state.error)}
          aria-describedby={state.error ? "booking-form-error" : undefined}
          className="flex h-9 w-full rounded-md border px-3 text-sm"
          defaultValue={offerings[0]?.id}
        >
          {offerings.map((o) => (
            <option key={o.id} value={o.id}>
              {localizedOfferingTitle(o, locale)} — {o.durationMinutes}{" "}
              {copy.minutesSuffix} — {o.priceMnt.toLocaleString()} ₮
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="scheduledStartAt">{copy.time}</Label>
        <select
          id="scheduledStartAt"
          name="scheduledStartAt"
          required
          aria-invalid={Boolean(state.error)}
          className="flex h-9 w-full rounded-md border px-3 text-sm"
        >
          {slots.map((slot) => (
            <option
              key={slot.startAt.toISOString()}
              value={slot.startAt.toISOString()}
            >
              {formatDateTimeUtc(slot.startAt, locale)} {copy.utc}
            </option>
          ))}
        </select>
      </div>
      {practiceAreas.length > 0 && (
        <div className="space-y-1">
          <Label htmlFor="practiceAreaId">{copy.practiceArea}</Label>
          <select
            id="practiceAreaId"
            name="practiceAreaId"
            className="flex h-9 w-full rounded-md border px-3 text-sm"
            defaultValue=""
          >
            <option value="">{copy.selectPlaceholder}</option>
            {practiceAreas.map((area) => (
              <option key={area.id} value={area.id}>
                {localizedTaxonomyName(area, locale)}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="issueSummary">{copy.summary}</Label>
        <textarea
          id="issueSummary"
          name="issueSummary"
          required
          minLength={20}
          rows={4}
          aria-invalid={Boolean(state.error)}
          aria-describedby={state.error ? "booking-form-error" : undefined}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder={copy.summaryPh}
        />
      </div>
      <Button
        type="submit"
        className="w-full bg-[#0F3D33] text-white hover:bg-[#0F3D33]/90"
        disabled={pending}
      >
        {pending ? copy.submitting : copy.submit}
      </Button>
    </form>
  );
}
