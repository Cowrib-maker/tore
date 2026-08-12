"use client";

import Link from "next/link";
import { useActionState } from "react";

import { resetPasswordAction } from "@/application/actions/auth.actions";
import type { ActionState } from "@/application/common/action-state";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

const initialState: ActionState = {};

export function ResetPasswordForm({
  copy,
  token,
  tokenValid,
}: {
  copy: Dictionary["auth"];
  token: string;
  tokenValid: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    resetPasswordAction,
    initialState,
  );

  if (!tokenValid) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{copy.resetTitle}</CardTitle>
          <CardDescription>{copy.resetInvalid}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/forgot-password"
            className={cn(buttonVariants(), "w-full")}
          >
            {copy.sendReset}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{copy.resetTitle}</CardTitle>
        <CardDescription>{copy.resetDescription}</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <input type="hidden" name="token" value={token} />
        <CardContent className="space-y-4">
          {state.error && (
            <div
              id="reset-password-form-error"
              role="alert"
              aria-live="assertive"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {state.error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="password">{copy.newPassword}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
              aria-invalid={Boolean(state.error)}
              aria-describedby={
                state.error ? "reset-password-form-error" : undefined
              }
            />
            <p className="text-xs text-muted-foreground">{copy.passwordHint}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{copy.confirmPassword}</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? copy.sending : copy.resetSubmit}
          </Button>
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            {copy.backToSignIn}
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
