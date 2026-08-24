"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction } from "@/application/actions/auth.actions";
import {
  AUTH_ACTION_CODE,
  type ActionState,
} from "@/application/common/action-state";
import { EmailVerificationPanel } from "@/components/auth/email-verification-panel";
import { pendingEmailVerificationPageModel } from "@/application/services/email-verification-flow";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Dictionary } from "@/i18n/types";

const initialState: ActionState = {};

export function LoginForm({
  copy,
  callbackUrl,
}: {
  copy: Dictionary["auth"];
  callbackUrl?: string | null;
}) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const registerHref = callbackUrl
    ? `/register/client?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "/register/client";

  if (state.code === AUTH_ACTION_CODE.EMAIL_NOT_VERIFIED) {
    return (
      <EmailVerificationPanel
        copy={copy}
        model={pendingEmailVerificationPageModel(state.email ?? null, callbackUrl ?? null)}
      />
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{copy.loginTitle}</CardTitle>
          <CardDescription>{copy.loginDescription}</CardDescription>
        </CardHeader>
        <form action={formAction}>
          {callbackUrl ? (
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
          ) : null}
          <CardContent className="space-y-4">
            {state.error && (
              <div
                id="login-form-error"
                role="alert"
                aria-live="assertive"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {state.error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">{copy.email}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder={copy.emailPlaceholder}
                required
                autoComplete="email"
                aria-invalid={Boolean(state.error)}
                aria-describedby={state.error ? "login-form-error" : undefined}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{copy.password}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                aria-invalid={Boolean(state.error)}
                aria-describedby={state.error ? "login-form-error" : undefined}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? copy.signingIn : copy.signInSubmit}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link
                href="/forgot-password"
                className="text-primary underline-offset-4 hover:underline"
              >
                {copy.forgotPassword}
              </Link>
            </p>
            <p className="text-center text-sm text-muted-foreground">
              <Link
                href="/verify-email"
                className="text-primary underline-offset-4 hover:underline"
              >
                {copy.verifyNeedsLink}
              </Link>
            </p>
            <p className="text-center text-sm text-muted-foreground">
              {copy.newToTore}{" "}
              <Link
                href={registerHref}
                className="text-primary underline-offset-4 hover:underline"
              >
                {copy.registerClientLink}
              </Link>
              {" · "}
              <Link
                href="/register/lawyer"
                className="text-primary underline-offset-4 hover:underline"
              >
                {copy.registerLawyerLink}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
