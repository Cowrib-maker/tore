"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import type { ActionState } from "@/application/actions/auth.actions";
import { updateLawyerProfileAction } from "@/application/actions/profile.actions";
import { LAWYER_TIMEZONE_OPTIONS } from "@/application/validators/profile.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";
import { cn } from "@/lib/utils";

const initialState: ActionState = {};

type LawyerProfileFormProps = {
  headline: string;
  bio: string;
  yearsOfExperience: number | null;
  city: string;
  education: string;
  timezone: string;
  isListed: boolean;
  canRequestListing: boolean;
  copy: MarketplaceDictionary["lawyerProfileForm"] &
    Pick<MarketplaceDictionary["common"], "saving">;
};

export function LawyerProfileForm({
  headline,
  bio,
  yearsOfExperience,
  city,
  education,
  timezone,
  isListed,
  canRequestListing,
  copy,
}: LawyerProfileFormProps) {
  const [state, formAction, pending] = useActionState(
    updateLawyerProfileAction,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success(copy.savedToast);
    }
  }, [state, copy.savedToast]);

  const timezoneOptions = LAWYER_TIMEZONE_OPTIONS.includes(
    timezone as (typeof LAWYER_TIMEZONE_OPTIONS)[number],
  )
    ? LAWYER_TIMEZONE_OPTIONS
    : ([timezone, ...LAWYER_TIMEZONE_OPTIONS] as string[]);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div
          id="lawyer-profile-form-error"
          role="alert"
          aria-live="assertive"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="headline">{copy.headline}</Label>
        <Input
          id="headline"
          name="headline"
          defaultValue={headline ?? ""}
          placeholder={copy.headlinePh}
          maxLength={160}
          aria-invalid={Boolean(state.error)}
          aria-describedby={
            state.error ? "lawyer-profile-form-error" : undefined
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="bio">{copy.bio}</Label>
        <textarea
          id="bio"
          name="bio"
          defaultValue={bio ?? ""}
          rows={6}
          maxLength={5000}
          placeholder={copy.bioPh}
          aria-invalid={Boolean(state.error)}
          aria-describedby={
            state.error ? "lawyer-profile-form-error" : undefined
          }
          className={cn(
            "flex w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base shadow-xs outline-none",
            "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          )}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="education">{copy.education}</Label>
        <textarea
          id="education"
          name="education"
          defaultValue={education ?? ""}
          rows={3}
          maxLength={2000}
          placeholder={copy.educationPh}
          aria-invalid={Boolean(state.error)}
          aria-describedby={
            state.error ? "lawyer-profile-form-error" : undefined
          }
          className={cn(
            "flex w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base shadow-xs outline-none",
            "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          )}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="city">{copy.city}</Label>
          <Input
            id="city"
            name="city"
            defaultValue={city ?? ""}
            placeholder={copy.cityPh}
            maxLength={120}
            aria-invalid={Boolean(state.error)}
            aria-describedby={
              state.error ? "lawyer-profile-form-error" : undefined
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="yearsOfExperience">{copy.years}</Label>
          <Input
            id="yearsOfExperience"
            name="yearsOfExperience"
            type="number"
            min={0}
            max={70}
            defaultValue={yearsOfExperience?.toString() ?? ""}
            placeholder={copy.optionalPh}
            aria-invalid={Boolean(state.error)}
            aria-describedby={
              state.error ? "lawyer-profile-form-error" : undefined
            }
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="timezone">{copy.timezone}</Label>
        <select
          id="timezone"
          name="timezone"
          defaultValue={timezone ?? ""}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          aria-invalid={Boolean(state.error)}
          aria-describedby={
            state.error ? "lawyer-profile-form-error" : undefined
          }
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
          defaultChecked={isListed ?? false}
          disabled={!canRequestListing}
          className="mt-1 size-4 rounded border-input"
        />
        <div className="space-y-1">
          <Label htmlFor="isListed" className="text-sm font-normal leading-snug">
            {copy.listProfile}
          </Label>
          {!canRequestListing && (
            <p className="text-xs text-muted-foreground">{copy.listHelp}</p>
          )}
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? copy.saving : copy.save}
      </Button>
    </form>
  );
}
