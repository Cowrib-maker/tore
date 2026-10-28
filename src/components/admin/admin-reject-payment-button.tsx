"use client";

import { useActionState, useState } from "react";

import type { ActionState } from "@/application/common/action-state";
import { adminRejectManualPaymentAction } from "@/application/actions/admin-payments.actions";
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

export function AdminRejectPaymentButton({ invoiceId }: { invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const next = await adminRejectManualPaymentAction(previous, formData);
      // Close from the action itself (an event path), not from an effect that reacts to state.
      if (next.success) setOpen(false);
      return next;
    },
    initial,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" variant="destructive" />}>
        Татгалзах
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Төлбөрөөс татгалзах</DialogTitle>
          <DialogDescription>
            Шилжүүлэг олдоогүй эсвэл дүн зөрсөн зэрэг шалтгааныг тодорхой бичнэ үү.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Шалтгаан
            <textarea
              name="reason"
              rows={2}
              required
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          {state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Цуцлах</DialogClose>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "…" : "Татгалзах"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
