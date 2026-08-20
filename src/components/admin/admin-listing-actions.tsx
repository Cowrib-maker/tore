"use client";

import { useActionState } from "react";

import type { ActionState } from "@/application/common/action-state";
import { setLawyerDirectoryListingAction } from "@/application/actions/verification.actions";
import { Button } from "@/components/ui/button";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

const initialState: ActionState = {};

export function AdminListingActions({
  lawyerProfileId,
  isListed,
  canList,
  copy,
}: {
  lawyerProfileId: string;
  isListed: boolean;
  canList: boolean;
  copy: MarketplaceDictionary["admin"];
}) {
  const [state, formAction, pending] = useActionState(
    setLawyerDirectoryListingAction,
    initialState,
  );

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
          {isListed ? copy.unlist : copy.list}
        </Button>
      </form>
    </div>
  );
}
