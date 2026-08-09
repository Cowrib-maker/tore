"use client";

import { useActionState } from "react";

import type { ActionState } from "@/application/actions/auth.actions";
import {
  createOfferingAction,
  deleteOfferingAction,
  updateOfferingAction,
} from "@/application/actions/marketplace.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ConsultationOffering } from "@/domain/entities/consultation-offering";
import { ConsultationModality } from "@/domain/enums";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

const initialState: ActionState = {};

type OfferingCopy = MarketplaceDictionary["offeringForm"] &
  Pick<MarketplaceDictionary["common"], "online" | "inPerson" | "saving" | "removing">;

export function CreateOfferingForm({ copy }: { copy: OfferingCopy }) {
  const [state, formAction, pending] = useActionState(
    createOfferingAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3 rounded-xl border p-4">
      <h3 className="font-medium">{copy.createTitle}</h3>
      {state.error && (
        <div
          id="create-offering-form-error"
          role="alert"
          aria-live="assertive"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
          {copy.created}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="titleMn">{copy.titleMn}</Label>
          <Input
            id="titleMn"
            name="titleMn"
            required
            minLength={2}
            aria-invalid={Boolean(state.error)}
            aria-describedby={
              state.error ? "create-offering-form-error" : undefined
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="titleEn">{copy.titleEn}</Label>
          <Input
            id="titleEn"
            name="titleEn"
            aria-invalid={Boolean(state.error)}
            aria-describedby={
              state.error ? "create-offering-form-error" : undefined
            }
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="descriptionMn">{copy.description}</Label>
          <textarea
            id="descriptionMn"
            name="descriptionMn"
            rows={3}
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder={copy.descriptionPh}
            aria-invalid={Boolean(state.error)}
            aria-describedby={
              state.error ? "create-offering-form-error" : undefined
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="durationMinutes">{copy.duration}</Label>
          <Input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={15}
            max={480}
            defaultValue={60}
            required
            aria-invalid={Boolean(state.error)}
            aria-describedby={
              state.error ? "create-offering-form-error" : undefined
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="priceMnt">{copy.fee}</Label>
          <Input
            id="priceMnt"
            name="priceMnt"
            type="number"
            min={1000}
            defaultValue={100000}
            required
            aria-invalid={Boolean(state.error)}
            aria-describedby={
              state.error ? "create-offering-form-error" : undefined
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="modality">{copy.format}</Label>
          <select
            id="modality"
            name="modality"
            className="flex h-9 w-full rounded-md border px-3 text-sm"
            defaultValue={ConsultationModality.ONLINE}
            aria-invalid={Boolean(state.error)}
            aria-describedby={
              state.error ? "create-offering-form-error" : undefined
            }
          >
            <option value={ConsultationModality.ONLINE}>{copy.online}</option>
            <option value={ConsultationModality.IN_PERSON}>
              {copy.inPerson}
            </option>
          </select>
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? copy.saving : copy.publish}
      </Button>
    </form>
  );
}

export function OfferingRow({
  offering,
  copy,
}: {
  offering: ConsultationOffering;
  copy: OfferingCopy;
}) {
  const [updateState, updateAction, updating] = useActionState(
    updateOfferingAction,
    initialState,
  );
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteOfferingAction,
    initialState,
  );

  const formError = updateState.error ?? deleteState.error;

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <form action={updateAction} className="space-y-3">
        <input type="hidden" name="offeringId" value={offering.id} />
        {formError && (
          <div
            id="offering-update-form-error"
            role="alert"
            aria-live="assertive"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {formError}
          </div>
        )}
        {updateState.success && (
          <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
            {copy.saved}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>{copy.titleMn}</Label>
            <Input
              name="titleMn"
              defaultValue={offering.titleMn}
              required
              aria-invalid={Boolean(formError)}
              aria-describedby={
                formError ? "offering-update-form-error" : undefined
              }
            />
          </div>
          <div className="space-y-1">
            <Label>{copy.titleEn}</Label>
            <Input
              name="titleEn"
              defaultValue={offering.titleEn ?? ""}
              aria-invalid={Boolean(formError)}
              aria-describedby={
                formError ? "offering-update-form-error" : undefined
              }
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>{copy.description}</Label>
            <textarea
              name="descriptionMn"
              rows={2}
              defaultValue={offering.descriptionMn ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
              aria-invalid={Boolean(formError)}
              aria-describedby={
                formError ? "offering-update-form-error" : undefined
              }
            />
          </div>
          <div className="space-y-1">
            <Label>{copy.duration}</Label>
            <Input
              name="durationMinutes"
              type="number"
              defaultValue={offering.durationMinutes}
              required
              aria-invalid={Boolean(formError)}
              aria-describedby={
                formError ? "offering-update-form-error" : undefined
              }
            />
          </div>
          <div className="space-y-1">
            <Label>{copy.fee}</Label>
            <Input
              name="priceMnt"
              type="number"
              defaultValue={offering.priceMnt}
              required
              aria-invalid={Boolean(formError)}
              aria-describedby={
                formError ? "offering-update-form-error" : undefined
              }
            />
          </div>
          <div className="space-y-1">
            <Label>{copy.format}</Label>
            <select
              name="modality"
              className="flex h-9 w-full rounded-md border px-3 text-sm"
              defaultValue={offering.modality}
              aria-invalid={Boolean(formError)}
              aria-describedby={
                formError ? "offering-update-form-error" : undefined
              }
            >
              <option value={ConsultationModality.ONLINE}>{copy.online}</option>
              <option value={ConsultationModality.IN_PERSON}>
                {copy.inPerson}
              </option>
            </select>
          </div>
          <div className="flex items-end gap-2 pb-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={offering.isActive}
              />
              {copy.active}
            </label>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={updating}>
            {updating ? copy.saving : copy.save}
          </Button>
        </div>
      </form>
      <form action={deleteAction}>
        <input type="hidden" name="offeringId" value={offering.id} />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={deleting}
        >
          {deleting ? copy.removing : copy.deactivate}
        </Button>
      </form>
    </div>
  );
}
