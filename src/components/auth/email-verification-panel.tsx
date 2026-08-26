"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

import { EmailVerificationOtpForm } from "@/components/auth/email-verification-otp-form";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  loginHrefAfterEmailVerification,
  maskEmail,
  type EmailVerificationPageModel,
} from "@/application/services/email-verification-flow";
import { UserRole } from "@/domain/enums";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/i18n/types";

export function EmailVerificationPanel({
  copy,
  model,
}: {
  copy: Dictionary["auth"];
  model: EmailVerificationPageModel;
}) {
  const [outcome, setOutcome] = useState<"verified" | "already" | null>(null);
  const handleOutcome = useCallback((next: "verified" | "already") => {
    setOutcome((current) => (current === "verified" ? current : next));
  }, []);

  const continueHref =
    model.status === "success"
      ? model.continueHref
      : model.status === "pending"
        ? loginHrefAfterEmailVerification(UserRole.CLIENT, model.callbackUrl)
        : "/login";

  if (model.status === "success" || outcome) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {outcome === "already"
              ? copy.verifyPendingTitle
              : copy.verifyTitleSuccess}
          </CardTitle>
          <CardDescription>
            {outcome === "already"
              ? copy.verifyAlreadyVerified
              : copy.verifySuccess}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Link href={continueHref} className={cn(buttonVariants(), "w-full")}>
            {copy.verifyContinue}
          </Link>
        </CardContent>
      </Card>
    );
  }

  const isInvalid = model.status === "invalid";
  const isUnavailable = model.status === "unavailable";
  const description = isInvalid
    ? copy.verifyOtpExpired
    : isUnavailable
      ? copy.verifyTemporaryFailure
      : copy.verifyPendingBody;
  const email = model.email;
  const startCooldown = model.status === "pending" && model.sent;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>
          {isInvalid ? copy.verifyTitleError : copy.verifyPendingTitle}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {email ? (
          <p className="text-center text-sm font-medium" aria-live="polite">
            {maskEmail(email)}
          </p>
        ) : null}
        {!isInvalid && !isUnavailable ? (
          <p className="text-sm text-muted-foreground">{copy.verifySpamHint}</p>
        ) : null}
        <EmailVerificationOtpForm
          copy={copy}
          email={email}
          hideEmailField={Boolean(email)}
          startCooldown={startCooldown}
          onOutcome={handleOutcome}
        />
        <Link
          href="/login"
          className={cn(buttonVariants({ variant: "ghost" }), "w-full")}
        >
          {copy.verifyBackToLogin}
        </Link>
      </CardContent>
    </Card>
  );
}
