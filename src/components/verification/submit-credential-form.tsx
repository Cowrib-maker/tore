"use client";

import { useActionState } from "react";

import { type ActionState } from "@/application/actions/auth.actions";
import { submitLawyerCredentialAction } from "@/application/actions/verification.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

const initialState: ActionState = {};

export function SubmitCredentialForm({
  copy,
}: {
  copy: MarketplaceDictionary["submitCredential"];
}) {
  const [state, formAction, pending] = useActionState(
    submitLawyerCredentialAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div
          id="submit-credential-form-error"
          role="alert"
          aria-live="assertive"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
          {copy.success}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="licenseNumber">{copy.licenseNumber}</Label>
        <Input
          id="licenseNumber"
          name="licenseNumber"
          required
          autoComplete="off"
          placeholder={copy.licensePh}
          aria-invalid={Boolean(state.error)}
          aria-describedby={
            state.error ? "submit-credential-form-error" : undefined
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="issuingAuthority">{copy.authority}</Label>
        <Input
          id="issuingAuthority"
          name="issuingAuthority"
          required
          placeholder={copy.authorityPh}
          aria-invalid={Boolean(state.error)}
          aria-describedby={
            state.error ? "submit-credential-form-error" : undefined
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="document">{copy.document}</Label>
        <Input
          id="document"
          name="document"
          type="file"
          required
          accept="application/pdf,image/jpeg,image/png,image/webp"
          aria-invalid={Boolean(state.error)}
          aria-describedby={
            state.error ? "submit-credential-form-error" : undefined
          }
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? copy.uploading : copy.submit}
      </Button>
    </form>
  );
}
