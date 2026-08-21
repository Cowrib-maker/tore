"use client";

import { useActionState } from "react";

import type { ActionState } from "@/application/common/action-state";
import {
  adminClearHomepageSectionImageAction,
  adminSetHomepageSectionImageAction,
} from "@/application/actions/admin-homepage.actions";
import { Button } from "@/components/ui/button";
import type { HomepageSectionKey } from "@/domain/entities/homepage-section";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

const initial: ActionState = {};

export function AdminHomepageSectionRow({
  sectionKey,
  imageUrl,
  copy,
}: {
  sectionKey: HomepageSectionKey;
  imageUrl: string | null;
  copy: MarketplaceDictionary["adminHomepage"];
}) {
  const [uploadState, uploadAction, uploading] = useActionState(
    adminSetHomepageSectionImageAction,
    initial,
  );
  const [removeState, removeAction, removing] = useActionState(
    adminClearHomepageSectionImageAction,
    initial,
  );

  return (
    <div className="flex flex-col gap-4 border-b py-5 last:border-b-0 sm:flex-row sm:items-center">
      <div className="w-full max-w-[220px] shrink-0">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="aspect-video w-full rounded-lg border object-cover"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
            {copy.noImage}
          </div>
        )}
      </div>

      <div className="flex-1">
        <p className="font-medium">{copy.sectionLabels[sectionKey]}</p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          {sectionKey}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <form action={uploadAction} className="flex items-center gap-2">
            <input type="hidden" name="key" value={sectionKey} />
            <input
              type="file"
              name="image"
              accept="image/jpeg,image/png,image/webp"
              required
              className="max-w-[220px] text-xs file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-2.5 file:py-1.5 file:text-xs file:font-medium"
            />
            <Button type="submit" size="sm" disabled={uploading}>
              {imageUrl ? copy.change : copy.upload}
            </Button>
          </form>

          {imageUrl ? (
            <form action={removeAction}>
              <input type="hidden" name="key" value={sectionKey} />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={removing}
              >
                {copy.remove}
              </Button>
            </form>
          ) : null}
        </div>

        {uploadState.success ? (
          <p className="mt-1.5 text-xs text-emerald-700">{copy.uploaded}</p>
        ) : null}
        {uploadState.error ? (
          <p className="mt-1.5 text-xs text-destructive">{uploadState.error}</p>
        ) : null}
        {removeState.success ? (
          <p className="mt-1.5 text-xs text-emerald-700">{copy.removed}</p>
        ) : null}
        {removeState.error ? (
          <p className="mt-1.5 text-xs text-destructive">{removeState.error}</p>
        ) : null}
      </div>
    </div>
  );
}
