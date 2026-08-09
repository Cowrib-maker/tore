"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import {
  updateClientProfileAction,
} from "@/application/actions/profile.actions";
import type { ActionState } from "@/application/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

const initialState: ActionState = {};

type ClientProfileFormProps = {
  phone: string;
  companyName: string;
  copy: MarketplaceDictionary["clientProfileForm"] &
    Pick<MarketplaceDictionary["common"], "saving">;
};

export function ClientProfileForm({
  phone,
  companyName,
  copy,
}: ClientProfileFormProps) {
  const [state, formAction, pending] = useActionState(
    updateClientProfileAction,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success(copy.savedToast);
    }
  }, [state, copy.savedToast]);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div
          id="client-profile-form-error"
          role="alert"
          aria-live="assertive"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="phone">{copy.phone}</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={phone ?? ""}
          placeholder={copy.phonePh}
          autoComplete="tel"
          aria-invalid={Boolean(state.error)}
          aria-describedby={
            state.error ? "client-profile-form-error" : undefined
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="companyName">{copy.company}</Label>
        <Input
          id="companyName"
          name="companyName"
          defaultValue={companyName ?? ""}
          placeholder={copy.companyPh}
          autoComplete="organization"
          aria-invalid={Boolean(state.error)}
          aria-describedby={
            state.error ? "client-profile-form-error" : undefined
          }
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? copy.saving : copy.save}
      </Button>
    </form>
  );
}
