"use client";

import Link from "next/link";
import { useActionState } from "react";

import { requestPasswordResetAction } from "@/application/actions/auth.actions";
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

export function ForgotPasswordForm({ copy }: { copy: Dictionary["auth"] }) {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    initialState,
  );

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{copy.forgotTitle}</CardTitle>
        <CardDescription>{copy.forgotDescription}</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          {state.error && (
            <div
              id="forgot-password-form-error"
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
            <Label htmlFor="email">{copy.email}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder={copy.emailPlaceholder}
              required
              autoComplete="email"
              aria-invalid={Boolean(state.error)}
              aria-describedby={
                state.error ? "forgot-password-form-error" : undefined
              }
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? copy.sending : copy.sendReset}
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
