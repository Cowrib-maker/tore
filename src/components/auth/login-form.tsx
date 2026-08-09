"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, type ActionState } from "@/application/actions/auth.actions";
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

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Sign in to TORE</CardTitle>
        <CardDescription>
          Access your client or lawyer dashboard on Mongolia&apos;s legal marketplace.
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
              autoComplete="current-password"
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in..." : "Sign in"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/forgot-password" className="text-primary underline-offset-4 hover:underline">
              Forgot password?
            </Link>
          </p>
          <p className="text-center text-sm text-muted-foreground">
            New to TORE?{" "}
            <Link href="/register/client" className="text-primary underline-offset-4 hover:underline">
              Register as client
            </Link>
            {" · "}
            <Link href="/register/lawyer" className="text-primary underline-offset-4 hover:underline">
              Register as lawyer
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
