"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import type { ActionState } from "@/application/common/action-state";
import { changePasswordAction } from "@/application/actions/account.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

const initialState: ActionState = {};

export function ChangePasswordForm({
  copy,
}: {
  copy: MarketplaceDictionary["account"] &
    Pick<MarketplaceDictionary["common"], "saving">;
}) {
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      toast.success(copy.passwordSavedToast);
      formRef.current?.reset();
    }
    if (state.error) {
      toast.error(state.error);
    }
  }, [state, copy.passwordSavedToast]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
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
        <Label htmlFor="currentPassword">{copy.currentPassword}</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="newPassword">{copy.newPassword}</Label>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">{copy.confirmPassword}</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? copy.saving : copy.changePasswordButton}
      </Button>
    </form>
  );
}
