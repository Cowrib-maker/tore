"use client";

import { useActionState } from "react";

import { resendVerificationEmailAction } from "@/application/actions/auth.actions";
import {
  AUTH_ACTION_CODE,
  type ActionState,
} from "@/application/common/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Dictionary } from "@/i18n/types";

const initialState: ActionState = {};

export function ResendVerificationForm({
  copy,
  defaultEmail,
  submitLabel,
  hideEmailField = false,
}: {
  copy: Dictionary["auth"];
  defaultEmail?: string | null;
  submitLabel?: string;
  hideEmailField?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    resendVerificationEmailAction,
    initialState,
  );

  const knownEmail = defaultEmail?.trim() ?? "";
  const showEmailField = !hideEmailField || !knownEmail;
  const successMessage =
    state.success && state.code === AUTH_ACTION_CODE.RESEND_SENT
      ? copy.resendGenericSuccess
      : state.success
        ? copy.resendGenericSuccess
        : null;
  const errorMessage =
    state.code === AUTH_ACTION_CODE.RATE_LIMITED
      ? copy.verifyRateLimited
      : state.error;

  return (
    <form action={formAction} className="space-y-3">
      {errorMessage && (
        <div
          id="resend-verification-form-error"
          role="alert"
          aria-live="assertive"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800"
        >
          {successMessage}
        </div>
      )}
      {showEmailField ? (
        <div className="space-y-2">
          <Label htmlFor="resend-email">{copy.email}</Label>
          <Input
            id="resend-email"
            name="email"
            type="email"
            defaultValue={knownEmail}
            placeholder={copy.emailPlaceholder}
            required
            autoComplete="email"
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={
              errorMessage ? "resend-verification-form-error" : undefined
            }
          />
        </div>
      ) : (
        <input type="hidden" name="email" value={knownEmail} />
      )}
      <Button
        type="submit"
        variant="outline"
        className="w-full"
        disabled={pending}
      >
        {pending ? copy.resendSending : (submitLabel ?? copy.verifyResend)}
      </Button>
    </form>
  );
}
