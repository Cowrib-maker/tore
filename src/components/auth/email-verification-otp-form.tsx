"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { verifyEmailOtpAction } from "@/application/actions/auth.actions";
import {
  AUTH_ACTION_CODE,
  type ActionState,
} from "@/application/common/action-state";
import { userFacingResendFeedback } from "@/application/common/map-email-verification-error";
import { OtpInput } from "@/components/auth/otp-input";
import { ResendVerificationForm } from "@/components/auth/resend-verification-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
  formatResendCountdown,
} from "@/domain/services/email-verification-token";
import type { Dictionary } from "@/i18n/types";

const initialState: ActionState = {};

export function EmailVerificationOtpForm({
  copy,
  email,
  hideEmailField,
  startCooldown,
  onOutcome,
}: {
  copy: Dictionary["auth"];
  email?: string | null;
  hideEmailField?: boolean;
  startCooldown?: boolean;
  onOutcome?: (outcome: "verified" | "already") => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const autoSubmitLock = useRef(false);
  const [state, formAction, pending] = useActionState(
    verifyEmailOtpAction,
    initialState,
  );
  const [cooldown, setCooldown] = useState(
    startCooldown ? EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS : 0,
  );

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!pending) {
      autoSubmitLock.current = false;
    }
  }, [pending]);

  useEffect(() => {
    if (state.success && state.code === AUTH_ACTION_CODE.EMAIL_VERIFIED) {
      onOutcome?.("verified");
    } else if (state.code === AUTH_ACTION_CODE.EMAIL_ALREADY_VERIFIED) {
      onOutcome?.("already");
    }
  }, [state, onOutcome]);

  const knownEmail = email?.trim() ?? "";
  const showEmailField = !hideEmailField || !knownEmail;
  const feedback = userFacingResendFeedback(state, copy);
  const errorMessage = feedback?.tone === "error" ? feedback.text : null;

  return (
    <div className="space-y-4">
      <form
        ref={formRef}
        action={formAction}
        className="space-y-3"
        onSubmit={(event) => {
          const form = event.currentTarget;
          const cells = form.querySelectorAll<HTMLInputElement>("[data-otp-cell]");
          const otp = Array.from(cells)
            .map((cell) => cell.value)
            .join("");
          const hidden = form.querySelector<HTMLInputElement>(
            'input[name="otp"]',
          );
          if (hidden) {
            hidden.value = otp;
          }
        }}
      >
        {errorMessage ? (
          <div
            id="verify-otp-form-error"
            role="alert"
            aria-live="assertive"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errorMessage}
          </div>
        ) : null}
        {showEmailField ? (
          <div className="space-y-2">
            <Label htmlFor="verify-otp-email">{copy.email}</Label>
            <Input
              id="verify-otp-email"
              name="email"
              type="email"
              defaultValue={knownEmail}
              placeholder={copy.emailPlaceholder}
              required
              autoComplete="email"
            />
          </div>
        ) : (
          <input type="hidden" name="email" value={knownEmail} />
        )}
        <div className="space-y-2">
          <Label id="verify-otp-label" className="block text-center">
            {copy.verifyOtpLabel}
          </Label>
          <OtpInput
            disabled={pending}
            error={Boolean(errorMessage)}
            labelledBy="verify-otp-label"
            onComplete={() => {
              if (autoSubmitLock.current || pending) return;
              autoSubmitLock.current = true;
              formRef.current?.requestSubmit();
            }}
          />
        </div>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? copy.verifyOtpSubmitting : copy.verifyOtpSubmit}
        </Button>
      </form>
      {cooldown > 0 ? (
        <p className="text-center text-sm text-muted-foreground" role="status">
          {copy.verifyResendCountdown.replace(
            "{time}",
            formatResendCountdown(cooldown),
          )}
        </p>
      ) : (
        <ResendVerificationForm
          copy={copy}
          defaultEmail={knownEmail || null}
          hideEmailField={Boolean(knownEmail) && !showEmailField}
          submitLabel={copy.verifyResend}
          onSent={() => setCooldown(EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS)}
        />
      )}
    </div>
  );
}
