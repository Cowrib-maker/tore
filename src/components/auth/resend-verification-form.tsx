"use client";

import { useActionState } from "react";

import {
  resendVerificationEmailAction,
  type ActionState,
} from "@/application/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Dictionary } from "@/i18n/types";

const initialState: ActionState = {};

export function ResendVerificationForm({
  copy,
}: {
  copy: Dictionary["auth"];
}) {
  const [state, formAction, pending] = useActionState(
    resendVerificationEmailAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-4">
      <div>
        <p className="text-sm font-medium">{copy.resendTitle}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {copy.resendDescription}
        </p>
      </div>
      {state.error && (
        <div
          id="resend-verification-form-error"
          role="alert"
          aria-live="assertive"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}
      {state.success && state.message && (
        <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
          {state.message}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="resend-email">{copy.email}</Label>
        <Input
          id="resend-email"
          name="email"
          type="email"
          placeholder={copy.emailPlaceholder}
          required
          autoComplete="email"
          aria-invalid={Boolean(state.error)}
          aria-describedby={
            state.error ? "resend-verification-form-error" : undefined
          }
        />
      </div>
      <Button
        type="submit"
        variant="outline"
        className="w-full"
        disabled={pending}
      >
        {pending ? copy.resendSending : copy.resendSubmit}
      </Button>
    </form>
  );
}
