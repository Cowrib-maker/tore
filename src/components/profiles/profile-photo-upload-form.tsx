"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  PROFILE_PHOTO_ALLOWED_TYPES,
  PROFILE_PHOTO_MAX_BYTES,
} from "@/application/validators/profile.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

type Copy = MarketplaceDictionary["profilePhoto"];

const CLIENT_TIMEOUT_MS = 40_000;

function errorFor(code: string | undefined, copy: Copy): string {
  if (code === "FILE_TOO_LARGE") return copy.errorTooLarge;
  if (code === "UNSUPPORTED_FILE_TYPE") return copy.errorType;
  return copy.errorGeneric;
}

export function ProfilePhotoUploadForm({
  photoUrl,
  copy,
}: {
  photoUrl: string | null;
  copy: Copy;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Release the blob URL when the selection changes or the form unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function clearSelection() {
    setSelected(null);
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSuccess(false);
    setError("");
    if (!file) {
      clearSelection();
      return;
    }
    // Fast client-side gate; the server re-validates from the file bytes.
    if (
      !PROFILE_PHOTO_ALLOWED_TYPES.includes(
        file.type as (typeof PROFILE_PHOTO_ALLOWED_TYPES)[number],
      )
    ) {
      clearSelection();
      setError(copy.errorType);
      return;
    }
    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      clearSelection();
      setError(copy.errorTooLarge);
      return;
    }
    setSelected(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || pending) return;
    setPending(true);
    setError("");
    setSuccess(false);
    try {
      const body = new FormData();
      body.append("photo", selected);
      const response = await fetch("/api/profile/photo", {
        method: "POST",
        body,
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          code?: string;
        } | null;
        // Keep showing the existing photo; only the message changes.
        clearSelection();
        setError(errorFor(data?.code, copy));
        return;
      }
      setSuccess(true);
      router.refresh();
    } catch {
      clearSelection();
      setError(copy.errorGeneric);
    } finally {
      setPending(false);
    }
  }

  const shownUrl = previewUrl ?? photoUrl;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {shownUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shownUrl}
            alt=""
            data-testid="profile-photo-preview"
            className="size-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
            {copy.noPhoto}
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          {previewUrl ? copy.previewNote : copy.description}
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <div
            id="profile-photo-form-error"
            role="alert"
            aria-live="assertive"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
            {copy.success}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="photo">{copy.chooseFile}</Label>
          <Input
            ref={inputRef}
            id="photo"
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleChange}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "profile-photo-form-error" : undefined}
          />
        </div>
        <Button
          type="submit"
          disabled={pending || !selected}
          size="sm"
          variant="outline"
        >
          {pending ? copy.uploading : copy.submit}
        </Button>
      </form>
    </div>
  );
}
