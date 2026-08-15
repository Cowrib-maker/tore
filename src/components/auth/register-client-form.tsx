"use client";

import Link from "next/link";
import { useActionState } from "react";

import { registerClientAction } from "@/application/actions/auth.actions";
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

export function RegisterClientForm({
  copy,
  locale,
  callbackUrl,
}: {
  copy: Dictionary["auth"];
  locale: Locale;
  callbackUrl?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    registerClientAction,
    initialState,
  );

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{copy.clientTitle}</CardTitle>
        <CardDescription>{copy.clientDescription}</CardDescription>
      </CardHeader>
        <form action={formAction}>
          {callbackUrl ? (
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
          ) : null}
          <CardContent className="space-y-4">
          {state.error && (
            <div
              id="register-client-form-error"
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
                state.error ? "register-client-form-error" : undefined
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
                state.error ? "register-client-form-error" : undefined
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
                state.error ? "register-client-form-error" : undefined
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
                state.error ? "register-client-form-error" : undefined
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
              {copy.acceptTermsLead}{" "}
              <Link
                href="/terms"
                className="text-primary underline-offset-4 hover:underline"
              >
                {copy.termsOfService}
              </Link>
              {", "}
              <Link
                href="/privacy"
                className="text-primary underline-offset-4 hover:underline"
              >
                {copy.privacyPolicy}
              </Link>
              {copy.acceptTermsTrail}
            </Label>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? copy.creating : copy.createClient}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {copy.areYouLawyer}{" "}
            <Link
              href="/register/lawyer"
              className="text-primary underline-offset-4 hover:underline"
            >
              {copy.registerAsLawyer}
            </Link>
          </p>
          <p className="text-center text-sm text-muted-foreground">
            {copy.alreadyHave}{" "}
            <Link
              href={
                callbackUrl
                  ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
                  : "/login"
              }
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
