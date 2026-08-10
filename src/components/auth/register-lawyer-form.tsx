"use client";

import Link from "next/link";
import { useActionState } from "react";

import { registerLawyerAction } from "@/application/actions/auth.actions";
import type { ActionState } from "@/application/common/action-state";
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
import { NativeSelect } from "@/components/ui/native-select";
import { localeMeta, type Locale } from "@/i18n/config";
import { localeMenuOrder } from "@/i18n/client-storage";
import type { Dictionary } from "@/i18n/types";

const initialState: ActionState = {};

export function RegisterLawyerForm({
  copy,
  locale,
}: {
  copy: Dictionary["auth"];
  locale: Locale;
}) {
  const [state, formAction, pending] = useActionState(
    registerLawyerAction,
    initialState,
  );

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{copy.lawyerTitle}</CardTitle>
        <CardDescription>{copy.lawyerDescription}</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          {state.error && (
            <div
              id="register-lawyer-form-error"
              role="alert"
              aria-live="assertive"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {state.error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">{copy.fullName}</Label>
            <Input
              id="name"
              name="name"
              placeholder={copy.namePlaceholder}
              required
              aria-invalid={Boolean(state.error)}
              aria-describedby={
                state.error ? "register-lawyer-form-error" : undefined
              }
            />
          </div>
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
                state.error ? "register-lawyer-form-error" : undefined
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{copy.password}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
              aria-invalid={Boolean(state.error)}
              aria-describedby={
                state.error ? "register-lawyer-form-error" : undefined
              }
            />
            <p className="text-xs text-muted-foreground">{copy.passwordHint}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="preferredLanguage">{copy.preferredLanguage}</Label>
            <NativeSelect
              id="preferredLanguage"
              name="preferredLanguage"
              defaultValue={locale}
              aria-invalid={Boolean(state.error)}
              aria-describedby={
                state.error ? "register-lawyer-form-error" : undefined
              }
            >
              {localeMenuOrder.map((code) => (
                <option key={code} value={code}>
                  {localeMeta[code].nativeLabel}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex items-start gap-2">
            <input
              id="acceptTerms"
              name="acceptTerms"
              type="checkbox"
              required
              className="mt-1 size-4 rounded border-input"
            />
            <Label htmlFor="acceptTerms" className="text-sm font-normal leading-snug">
              {copy.acceptTerms}
            </Label>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? copy.creating : copy.createLawyer}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {copy.areYouClient}{" "}
            <Link
              href="/register/client"
              className="text-primary underline-offset-4 hover:underline"
            >
              {copy.registerAsClient}
            </Link>
          </p>
          <p className="text-center text-sm text-muted-foreground">
            {copy.alreadyHave}{" "}
            <Link
              href="/login"
              className="text-primary underline-offset-4 hover:underline"
            >
              {copy.signInSubmit}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
