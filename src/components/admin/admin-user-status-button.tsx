"use client";

import { useActionState } from "react";

import type { ActionState } from "@/application/common/action-state";
import { adminSetUserStatusAction } from "@/application/actions/admin-users.actions";
import { Button } from "@/components/ui/button";
import { UserStatus } from "@/domain/enums";

const initial: ActionState = {};

export function AdminUserStatusButton({
  userId,
  status,
  suspendLabel,
  activateLabel,
}: {
  userId: string;
  status: UserStatus;
  suspendLabel: string;
  activateLabel: string;
}) {
  const [state, formAction, pending] = useActionState(
    adminSetUserStatusAction,
    initial,
  );
  const nextStatus =
    status === UserStatus.SUSPENDED ? UserStatus.ACTIVE : UserStatus.SUSPENDED;

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value={nextStatus} />
      <Button
        type="submit"
        size="sm"
        variant={status === UserStatus.SUSPENDED ? "default" : "outline"}
        disabled={pending}
      >
        {pending
          ? "…"
          : status === UserStatus.SUSPENDED
            ? activateLabel
            : suspendLabel}
      </Button>
      {state.error ? (
        <span className="text-xs text-destructive">{state.error}</span>
      ) : null}
    </form>
  );
}
