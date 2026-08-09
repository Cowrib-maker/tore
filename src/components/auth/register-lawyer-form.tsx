"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  registerLawyerAction,
  type ActionState,
} from "@/application/actions/auth.actions";
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

const initialState: ActionState = {};

export function RegisterLawyerForm() {
  const [state, formAction, pending] = useActionState(
    registerLawyerAction,
    initialState,
  );

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Join TORE as a lawyer</CardTitle>
        <CardDescription>
          Offer legal consultations to clients across Mongolia. License verification required before listing.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          {state.error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" placeholder="Your legal name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@firm.mn"
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              Min 8 characters, one uppercase letter, one number.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="preferredLanguage">Preferred language</Label>
            <select
              id="preferredLanguage"
              name="preferredLanguage"
              defaultValue="mn"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            >
              <option value="mn">Mongolian</option>
              <option value="en">English</option>
            </select>
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
              I accept the Terms of Service, Privacy Policy, and Marketplace Disclaimer.
            </Label>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating account..." : "Create lawyer account"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Looking for legal help?{" "}
            <Link href="/register/client" className="text-primary underline-offset-4 hover:underline">
              Register as client
            </Link>
          </p>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
