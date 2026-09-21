"use client";

import { useActionState, useEffect, useState } from "react";

import type { ActionState } from "@/application/common/action-state";
import { adminDeactivateUserAction } from "@/application/actions/admin-users.actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

const initial: ActionState = {};

export function AdminDeactivateUserButton({
  userId,
  copy,
}: {
  userId: string;
  copy: MarketplaceDictionary["adminUsers"];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    adminDeactivateUserAction,
    initial,
  );

  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" variant="destructive" />}>
        {copy.deactivate}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.deactivate}</DialogTitle>
          <DialogDescription>{copy.deactivateConfirmBody}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="userId" value={userId} />
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {copy.reasonLabel}
            <textarea
              name="reason"
              rows={2}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          {state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {copy.cancel}
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "…" : copy.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
