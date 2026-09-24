"use client";

import { useActionState } from "react";

import type { ActionState } from "@/application/common/action-state";
import { adminVerifyQpayInvoiceAction } from "@/application/actions/admin-payment-center.actions";
import { Button } from "@/components/ui/button";

const initial: ActionState = {};

/**
 * Re-runs the real QPay payment/check for one invoice. Never marks an
 * invoice as paid directly — only QPay's own verified response can do
 * that (see verifyAdminQpayInvoiceUseCase).
 */
export function AdminVerifyQpayButton({ invoiceId }: { invoiceId: string }) {
  const [state, formAction, pending] = useActionState(
    adminVerifyQpayInvoiceAction,
    initial,
  );

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "…" : "QPay-р шалгах"}
      </Button>
      {state.error ? (
        <p className="text-xs text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-xs text-muted-foreground">Шалгагдлаа.</p>
      ) : null}
    </form>
  );
}
