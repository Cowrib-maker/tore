"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import type { ActionState } from "@/application/common/action-state";
import { updateLawyerProfileAction } from "@/application/actions/profile.actions";
import { LAWYER_TIMEZONE_OPTIONS } from "@/application/validators/profile.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";
import { cn } from "@/lib/utils";

const initialState: ActionState = {};

type LawyerProfileFormProps = {
  lastName: string;
  firstName: string;
  phone: string;
  headline: string;
  bio: string;
  yearsOfExperience: number | null;
  city: string;
  education: string;
  timezone: string;
  copy: MarketplaceDictionary["lawyerProfileForm"] &
    Pick<MarketplaceDictionary["common"], "saving">;
};

export function LawyerProfileForm({
  lastName,
  firstName,
  phone,
  headline,
  bio,
  yearsOfExperience,
  city,
  education,
  timezone,
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
    if (state.error) {
      toast.error(state.error);
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="lastName">{copy.lastName}</Label>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={lastName}
            placeholder={copy.lastNamePh}
            maxLength={80}
            autoComplete="family-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="firstName">{copy.firstName}</Label>
          <Input
            id="firstName"
            name="firstName"
            defaultValue={firstName}
            placeholder={copy.firstNamePh}
            maxLength={80}
            autoComplete="given-name"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone">{copy.phone}</Label>
          <Input
            id="phone"
            name="phone"
            defaultValue={phone}
            placeholder={copy.phonePh}
            maxLength={32}
            autoComplete="tel"
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
          />
        </div>
      </div>
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
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="timezone">{copy.timezone}</Label>
          <NativeSelect
            id="timezone"
            name="timezone"
            defaultValue={timezone ?? ""}
          >
            {timezoneOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? copy.saving : copy.save}
      </Button>
    </form>
  );
}
