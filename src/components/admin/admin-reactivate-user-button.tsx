"use client";

import { useActionState } from "react";

import type { ActionState } from "@/application/common/action-state";
import { adminReactivateUserAction } from "@/application/actions/admin-users.actions";
import { Button } from "@/components/ui/button";

const initial: ActionState = {};

export function AdminReactivateUserButton({
  userId,
  label,
}: {
  userId: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(
    adminReactivateUserAction,
    initial,
  );

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" size="sm" variant="default" disabled={pending}>
        {pending ? "…" : label}
      </Button>
      {state.error ? (
        <span className="text-xs text-destructive">{state.error}</span>
      ) : null}
    </form>
  );
}
