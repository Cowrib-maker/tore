"use client";

import { useActionState, useState } from "react";

import type { ActionState } from "@/application/common/action-state";
import { adminVerifyManualPaymentAction } from "@/application/actions/admin-payments.actions";
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

const initial: ActionState = {};

export function AdminVerifyPaymentButton({ invoiceId }: { invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const next = await adminVerifyManualPaymentAction(previous, formData);
      // Close from the action itself (an event path), not from an effect that reacts to state.
      if (next.success) setOpen(false);
      return next;
    },
    initial,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" />}>Баталгаажуулах</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Төлбөр баталгаажуулах</DialogTitle>
          <DialogDescription>
            Та энэ төлбөрийг баталгаажуулснаар хэрэглэгчийн эрх идэвхжинэ.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          {state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Цуцлах</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "…" : "Баталгаажуулах"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
