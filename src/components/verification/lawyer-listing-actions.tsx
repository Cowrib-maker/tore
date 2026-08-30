"use client";

import { useActionState } from "react";

import type { ActionState } from "@/application/common/action-state";
import { setOwnLawyerDirectoryListingAction } from "@/application/actions/verification.actions";
import { Button } from "@/components/ui/button";

const initialState: ActionState = {};

export function LawyerListingActions({
  lawyerProfileId,
  isListed,
  canList,
  copy,
}: {
  lawyerProfileId: string;
  isListed: boolean;
  canList: boolean;
  copy: {
    listingShow: string;
    listingHide: string;
    listingNeedApproval: string;
  };
}) {
  const [state, formAction, pending] = useActionState(
    setOwnLawyerDirectoryListingAction,
    initialState,
  );

  if (!canList && !isListed) {
    return (
      <p className="text-sm text-muted-foreground">{copy.listingNeedApproval}</p>
    );
  }

  return (
    <div className="space-y-2">
      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <form action={formAction}>
        <input type="hidden" name="lawyerProfileId" value={lawyerProfileId} />
        <input
          type="hidden"
          name="isListed"
          value={isListed ? "false" : "true"}
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={pending || (!isListed && !canList)}
        >
          {isListed ? copy.listingHide : copy.listingShow}
        </Button>
      </form>
    </div>
  );
}
