"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import {
  updateClientProfileAction,
} from "@/application/actions/profile.actions";
import type { ActionState } from "@/application/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionState = {};

type ClientProfileFormProps = {
  phone: string | null;
  companyName: string | null;
};

export function ClientProfileForm({
  phone,
  companyName,
}: ClientProfileFormProps) {
  const [state, formAction, pending] = useActionState(
    updateClientProfileAction,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success("Profile saved");
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={phone ?? ""}
          placeholder="+976 …"
          autoComplete="tel"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="companyName">Company name</Label>
        <Input
          id="companyName"
          name="companyName"
          defaultValue={companyName ?? ""}
          placeholder="Optional"
          autoComplete="organization"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
