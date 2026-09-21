"use client";

import { useActionState, useEffect, useState } from "react";

import type { ActionState } from "@/application/common/action-state";
import { adminChangeUserRoleAction } from "@/application/actions/admin-users.actions";
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
import { UserRole } from "@/domain/enums";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

const initial: ActionState = {};

export function AdminChangeUserRoleButton({
  userId,
  currentRole,
  copy,
}: {
  userId: string;
  currentRole: UserRole;
  copy: MarketplaceDictionary["adminUsers"];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    adminChangeUserRoleAction,
    initial,
  );

  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  if (currentRole !== UserRole.CLIENT && currentRole !== UserRole.LAWYER) {
    return null;
  }

  const newRole =
    currentRole === UserRole.CLIENT ? UserRole.LAWYER : UserRole.CLIENT;
  const label =
    currentRole === UserRole.CLIENT
      ? copy.changeRoleToLawyer
      : copy.changeRoleToClient;
  const confirmBody =
    currentRole === UserRole.CLIENT
      ? copy.changeRoleConfirmToLawyer
      : copy.changeRoleConfirmToClient;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>
        {label}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{confirmBody}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="newRole" value={newRole} />
          {state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {copy.cancel}
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "…" : copy.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
