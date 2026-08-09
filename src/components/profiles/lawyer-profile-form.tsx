"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import type { ActionState } from "@/application/actions/auth.actions";
import { updateLawyerProfileAction } from "@/application/actions/profile.actions";
import { LAWYER_TIMEZONE_OPTIONS } from "@/application/validators/profile.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const initialState: ActionState = {};

type LawyerProfileFormProps = {
  headline: string | null;
  bio: string | null;
  yearsOfExperience: number | null;
  timezone: string;
  isListed: boolean;
  canRequestListing: boolean;
};

export function LawyerProfileForm({
  headline,
  bio,
  yearsOfExperience,
  timezone,
  isListed,
  canRequestListing,
}: LawyerProfileFormProps) {
  const [state, formAction, pending] = useActionState(
    updateLawyerProfileAction,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success("Profile saved");
    }
  }, [state]);

  const timezoneOptions = LAWYER_TIMEZONE_OPTIONS.includes(
    timezone as (typeof LAWYER_TIMEZONE_OPTIONS)[number],
  )
    ? LAWYER_TIMEZONE_OPTIONS
    : ([timezone, ...LAWYER_TIMEZONE_OPTIONS] as string[]);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="headline">Headline</Label>
        <Input
          id="headline"
          name="headline"
          defaultValue={headline ?? ""}
          placeholder="Short professional headline"
          maxLength={160}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <textarea
          id="bio"
          name="bio"
          defaultValue={bio ?? ""}
          rows={6}
          maxLength={5000}
          placeholder="Describe your practice and experience"
          className={cn(
            "flex w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base shadow-xs outline-none",
            "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          )}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="yearsOfExperience">Years of experience</Label>
        <Input
          id="yearsOfExperience"
          name="yearsOfExperience"
          type="number"
          min={0}
          max={70}
          defaultValue={yearsOfExperience ?? ""}
          placeholder="Optional"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="timezone">Timezone</Label>
        <select
          id="timezone"
          name="timezone"
          defaultValue={timezone}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          {timezoneOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-start gap-2">
        {!canRequestListing ? (
          <input type="hidden" name="isListed" value={isListed ? "on" : ""} />
        ) : null}
        <input
          id="isListed"
          name="isListed"
          type="checkbox"
          defaultChecked={isListed}
          disabled={!canRequestListing}
          className="mt-1 size-4 rounded border-input"
        />
        <div className="space-y-1">
          <Label htmlFor="isListed" className="text-sm font-normal leading-snug">
            List my profile in the marketplace
          </Label>
          {!canRequestListing && (
            <p className="text-xs text-muted-foreground">
              Listing requires license verification and at least one active
              consultation offering.
            </p>
          )}
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
