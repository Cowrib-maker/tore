"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import type { ActionState } from "@/application/common/action-state";
import { changeEmailAction } from "@/application/actions/account.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

const initialState: ActionState = {};

export function ChangeEmailForm({
  currentEmail,
  copy,
}: {
  currentEmail: string;
  copy: MarketplaceDictionary["account"] &
    Pick<MarketplaceDictionary["common"], "saving">;
}) {
  const [state, formAction, pending] = useActionState(
    changeEmailAction,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success(copy.emailSavedToast);
    }
    if (state.error) {
      toast.error(state.error);
    }
  }, [state, copy.emailSavedToast]);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}
      <div className="space-y-2">
        <Label>{copy.currentEmail}</Label>
        <Input value={currentEmail} disabled readOnly />
      </div>
      <div className="space-y-2">
        <Label htmlFor="newEmail">{copy.newEmail}</Label>
        <Input
          id="newEmail"
          name="newEmail"
          type="email"
          placeholder={copy.newEmailPh}
          autoComplete="email"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="currentPasswordForEmail">{copy.currentPassword}</Label>
        <Input
          id="currentPasswordForEmail"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? copy.saving : copy.changeEmailButton}
      </Button>
    </form>
  );
}
