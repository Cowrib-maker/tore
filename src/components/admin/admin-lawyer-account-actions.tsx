"use client";

import { useActionState } from "react";

import type { ActionState } from "@/application/common/action-state";
import {
  adminReinstateLawyerAction,
  adminSuspendLawyerAction,
} from "@/application/actions/admin-lawyer-account.actions";
import { Button } from "@/components/ui/button";
import { LawyerVerificationStatus } from "@/domain/enums";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

const initial: ActionState = {};

export function AdminLawyerAccountActions({
  lawyerProfileId,
  verificationStatus,
  copy,
}: {
  lawyerProfileId: string;
  verificationStatus: LawyerVerificationStatus;
  copy: MarketplaceDictionary["admin"];
}) {
  const suspendState = useActionState(adminSuspendLawyerAction, initial);
  const reinstateState = useActionState(adminReinstateLawyerAction, initial);

  if (verificationStatus === LawyerVerificationStatus.SUSPENDED) {
    const [state, formAction, pending] = reinstateState;
    return (
      <div className="space-y-1">
        <form action={formAction}>
          <input type="hidden" name="lawyerProfileId" value={lawyerProfileId} />
          <Button type="submit" size="sm" variant="default" disabled={pending}>
            {pending ? "…" : copy.reinstateLawyer}
          </Button>
        </form>
        {state.error ? (
          <p className="text-xs text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
      </div>
    );
  }

  if (verificationStatus === LawyerVerificationStatus.APPROVED) {
    const [state, formAction, pending] = suspendState;
    return (
      <div className="space-y-1">
        <form action={formAction}>
          <input type="hidden" name="lawyerProfileId" value={lawyerProfileId} />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            {pending ? "…" : copy.suspendLawyer}
          </Button>
        </form>
        {state.error ? (
          <p className="text-xs text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
      </div>
    );
  }

  return null;
}
