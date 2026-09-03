"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useState,
} from "react";

import { resendVerificationEmailAction } from "@/application/actions/auth.actions";
import {
  AUTH_ACTION_CODE,
  type ActionState,
} from "@/application/common/action-state";
import { userFacingResendFeedback } from "@/application/common/map-email-verification-error";
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
  onSent,
}: {
  copy: Dictionary["auth"];
  defaultEmail?: string | null;
  submitLabel?: string;
  hideEmailField?: boolean;
  onSent?: () => void;
}) {
  const knownEmail = defaultEmail?.trim() ?? "";
  const [typedEmail, setTypedEmail] = useState(knownEmail);
  const boundAction = useMemo(
    () => resendVerificationEmailAction.bind(null, knownEmail || null),
    [knownEmail],
  );
  const [state, dispatch, pending] = useActionState(boundAction, initialState);

  useEffect(() => {
    if (state.success && state.code === AUTH_ACTION_CODE.RESEND_SENT) {
      onSent?.();
    }
  }, [onSent, state]);

  const showEmailField = !hideEmailField || !knownEmail;
  const feedback = userFacingResendFeedback(state, copy);
  const errorMessage = feedback?.tone === "error" ? feedback.text : null;
  const successMessage =
    feedback?.tone === "success" || feedback?.tone === "info"
      ? feedback.text
      : null;

  function submitResend() {
    const formData = new FormData();
    formData.set("email", knownEmail || typedEmail);
    startTransition(() => {
      dispatch(formData);
    });
  }

  return (
    <div className="space-y-3">
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
            value={typedEmail}
            onChange={(event) => setTypedEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitResend();
              }
            }}
            placeholder={copy.emailPlaceholder}
            required
            autoComplete="email"
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={
              errorMessage ? "resend-verification-form-error" : undefined
            }
          />
        </div>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={pending}
        onClick={submitResend}
      >
        {pending ? copy.resendSending : (submitLabel ?? copy.verifyResend)}
      </Button>
    </div>
  );
}
