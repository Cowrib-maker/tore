"use client";

import Link from "next/link";

import { ResendVerificationForm } from "@/components/auth/resend-verification-form";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { EmailVerificationPageModel } from "@/application/services/email-verification-flow";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/i18n/types";

export function EmailVerificationPanel({
  copy,
  model,
}: {
  copy: Dictionary["auth"];
  model: EmailVerificationPageModel;
}) {
  if (model.status === "success") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{copy.verifyTitleSuccess}</CardTitle>
          <CardDescription>
            {copy.verifySuccess.replace("{email}", model.email)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Link
            href={model.continueHref}
            className={cn(buttonVariants(), "w-full")}
          >
            {copy.verifyContinue}
          </Link>
        </CardContent>
      </Card>
    );
  }

  const isInvalid = model.status === "invalid";

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{copy.verifyPendingTitle}</CardTitle>
        <CardDescription>
          {isInvalid ? copy.verifyExpiredOrInvalid : copy.verifyPendingBody}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!isInvalid ? (
          <p className="text-sm text-muted-foreground">{copy.verifySpamHint}</p>
        ) : null}
        <ResendVerificationForm
          copy={copy}
          defaultEmail={model.email}
          hideEmailField={Boolean(model.email) && !isInvalid}
          submitLabel={isInvalid ? copy.verifyRequestNew : copy.verifyResend}
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
