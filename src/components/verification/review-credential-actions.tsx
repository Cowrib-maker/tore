"use client";

import { useActionState } from "react";

import type { ActionState } from "@/application/common/action-state";
import { reviewLawyerCredentialAction } from "@/application/actions/verification.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CredentialReviewStatus } from "@/domain/enums";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

const initialState: ActionState = {};

export function ReviewCredentialActions({
  credentialId,
  copy,
}: {
  credentialId: string;
  copy: MarketplaceDictionary["reviewCredential"];
}) {
  const [state, formAction, pending] = useActionState(
    reviewLawyerCredentialAction,
    initialState,
  );

  return (
    <div className="space-y-3">
      {state.error && (
        <div
          id="review-credential-actions-error"
          role="alert"
          aria-live="assertive"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
          {copy.saved}
        </div>
      )}
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="credentialId" value={credentialId} />
        <input
          type="hidden"
          name="decision"
          value={CredentialReviewStatus.APPROVED}
        />
        <Button type="submit" size="sm" disabled={pending}>
          {copy.approve}
        </Button>
      </form>
      <form action={formAction} className="space-y-2 rounded-lg border p-3">
        <input type="hidden" name="credentialId" value={credentialId} />
        <input
          type="hidden"
          name="decision"
          value={CredentialReviewStatus.REJECTED}
        />
        <div className="space-y-1">
          <Label htmlFor={`reason-${credentialId}`}>{copy.reason}</Label>
          <Input
            id={`reason-${credentialId}`}
            name="rejectionReason"
            placeholder={copy.reasonPh}
            required
            minLength={5}
            aria-invalid={Boolean(state.error)}
            aria-describedby={
              state.error ? "review-credential-actions-error" : undefined
            }
          />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {copy.reject}
        </Button>
      </form>
    </div>
  );
}
