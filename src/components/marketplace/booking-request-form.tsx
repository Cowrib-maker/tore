"use client";

import { useActionState } from "react";

import type { ActionState } from "@/application/common/action-state";
import { createBookingRequestAction } from "@/application/actions/marketplace.actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeTextarea } from "@/components/ui/native-select";
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
        <NativeSelect
          id="offeringId"
          name="offeringId"
          required
          aria-invalid={Boolean(state.error)}
          aria-describedby={state.error ? "booking-form-error" : undefined}
          defaultValue={offerings[0]?.id}
        >
          {offerings.map((o) => (
            <option key={o.id} value={o.id}>
              {localizedOfferingTitle(o, locale)} — {o.durationMinutes}{" "}
              {copy.minutesSuffix} — {o.priceMnt.toLocaleString()} ₮
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="scheduledStartAt">{copy.time}</Label>
        <NativeSelect
          id="scheduledStartAt"
          name="scheduledStartAt"
          required
          aria-invalid={Boolean(state.error)}
        >
          {slots.map((slot) => (
            <option
              key={slot.startAt.toISOString()}
              value={slot.startAt.toISOString()}
            >
              {formatDateTimeUtc(slot.startAt, locale)} {copy.utc}
            </option>
          ))}
        </NativeSelect>
      </div>
      {practiceAreas.length > 0 && (
        <div className="space-y-1">
          <Label htmlFor="practiceAreaId">{copy.practiceArea}</Label>
          <NativeSelect
            id="practiceAreaId"
            name="practiceAreaId"
            defaultValue=""
          >
            <option value="">{copy.selectPlaceholder}</option>
            {practiceAreas.map((area) => (
              <option key={area.id} value={area.id}>
                {localizedTaxonomyName(area, locale)}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="issueSummary">{copy.summary}</Label>
        <NativeTextarea
          id="issueSummary"
          name="issueSummary"
          required
          minLength={20}
          rows={4}
          aria-invalid={Boolean(state.error)}
          aria-describedby={state.error ? "booking-form-error" : undefined}
          placeholder={copy.summaryPh}
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? copy.submitting : copy.submit}
      </Button>
    </form>
  );
}
