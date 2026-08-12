"use client";

import { useActionState } from "react";
import Link from "next/link";

import {
  createOrganizationAction,
} from "@/application/actions/organization.actions";
import type { ActionState } from "@/application/common/action-state";
import { buttonVariants } from "@/components/ui/button";
import { OrganizationType } from "@/domain/enums";
import type { Dictionary } from "@/i18n/types";
import { cn } from "@/lib/utils";

type Copy = Dictionary["organizations"];

const initialState: ActionState = {};

export function CreateOrganizationForm({
  allowedTypes,
  copy,
}: {
  allowedTypes: OrganizationType[];
  copy: Copy;
}) {
  const [state, action, pending] = useActionState(
    createOrganizationAction,
    initialState,
  );

  if (allowedTypes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{copy.noCreatePermission}</p>
    );
  }

  return (
    <form action={action} className="space-y-5">
      {state.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="org-name" className="text-sm font-medium">
          {copy.nameLabel}
        </label>
        <input
          id="org-name"
          name="name"
          required
          minLength={2}
          maxLength={120}
          placeholder={copy.namePlaceholder}
          className="ds-field"
          disabled={pending}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{copy.typeLabel}</legend>
        <div className="space-y-2">
          {allowedTypes.includes(OrganizationType.LAW_FIRM) ? (
            <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <input
                type="radio"
                name="type"
                value={OrganizationType.LAW_FIRM}
                required
                defaultChecked={allowedTypes[0] === OrganizationType.LAW_FIRM}
                disabled={pending}
              />
              {copy.typeLawFirm}
            </label>
          ) : null}
          {allowedTypes.includes(OrganizationType.LEGAL_ENTITY) ? (
            <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <input
                type="radio"
                name="type"
                value={OrganizationType.LEGAL_ENTITY}
                required
                defaultChecked={
                  allowedTypes[0] === OrganizationType.LEGAL_ENTITY
                }
                disabled={pending}
              />
              {copy.typeLegalEntity}
            </label>
          ) : null}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className={cn(buttonVariants(), "cursor-pointer")}
        >
          {pending ? copy.createSubmitting : copy.createSubmit}
        </button>
        <Link
          href="/organizations"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          {copy.backToList}
        </Link>
      </div>
    </form>
  );
}
