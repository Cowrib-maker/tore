"use client";

import { useActionState } from "react";

import type { ActionState } from "@/application/common/action-state";
import { uploadProfilePhotoAction } from "@/application/actions/profile.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

const initialState: ActionState = {};

export function ProfilePhotoUploadForm({
  photoUrl,
  copy,
}: {
  photoUrl: string | null;
  copy: MarketplaceDictionary["profilePhoto"];
}) {
  const [state, formAction, pending] = useActionState(
    uploadProfilePhotoAction,
    initialState,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            className="size-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
            {copy.noPhoto}
          </div>
        )}
        <p className="text-sm text-muted-foreground">{copy.description}</p>
      </div>
      <form action={formAction} className="space-y-3">
        {state.error && (
          <div
            id="profile-photo-form-error"
            role="alert"
            aria-live="assertive"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {state.error}
          </div>
        )}
        {state.success && (
          <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
            {copy.success}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="photo">{copy.chooseFile}</Label>
          <Input
            id="photo"
            name="photo"
            type="file"
            required
            accept="image/jpeg,image/png,image/webp"
            aria-invalid={Boolean(state.error)}
            aria-describedby={
              state.error ? "profile-photo-form-error" : undefined
            }
          />
        </div>
        <Button type="submit" disabled={pending} size="sm" variant="outline">
          {pending ? copy.uploading : copy.submit}
        </Button>
      </form>
    </div>
  );
}
