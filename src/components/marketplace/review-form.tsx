"use client";

import { useActionState } from "react";

import type { ActionState } from "@/application/common/action-state";
import { submitReviewAction } from "@/application/actions/review.actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeTextarea } from "@/components/ui/native-select";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

const initialState: ActionState = {};

export function ReviewForm({
  bookingId,
  copy,
}: {
  bookingId: string;
  copy: MarketplaceDictionary["review"];
}) {
  const [state, formAction, pending] = useActionState(
    submitReviewAction,
    initialState,
  );

  if (state.success) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800"
      >
        {copy.success}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      {state.error && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor={`rating-${bookingId}`}>{copy.ratingLabel}</Label>
        <NativeSelect id={`rating-${bookingId}`} name="rating" required defaultValue="5">
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} / 5
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`comment-${bookingId}`}>{copy.commentLabel}</Label>
        <NativeTextarea
          id={`comment-${bookingId}`}
          name="comment"
          rows={3}
          placeholder={copy.commentPlaceholder}
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? copy.submitting : copy.submit}
      </Button>
    </form>
  );
}
