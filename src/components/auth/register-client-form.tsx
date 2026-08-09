"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  registerClientAction,
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

export function RegisterClientForm() {
  const [state, formAction, pending] = useActionState(
    registerClientAction,
    initialState,
  );

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Create a client account</CardTitle>
        <CardDescription>
          Find and book licensed lawyers for your legal needs in Mongolia.
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
            <Input id="name" name="name" placeholder="Your name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
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
            {pending ? "Creating account..." : "Create client account"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Are you a lawyer?{" "}
            <Link href="/register/lawyer" className="text-primary underline-offset-4 hover:underline">
              Register as lawyer
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
