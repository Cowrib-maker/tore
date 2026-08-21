"use client";

import { useActionState } from "react";

import type { ActionState } from "@/application/common/action-state";
import {
  adminTogglePracticeAreaActiveAction,
  adminUpdatePracticeAreaAction,
} from "@/application/actions/admin-taxonomy.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PracticeArea } from "@/domain/entities/taxonomy";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

const initial: ActionState = {};

export function AdminPracticeAreaRow({
  area,
  copy,
}: {
  area: PracticeArea;
  copy: MarketplaceDictionary["adminTaxonomy"] &
    Pick<MarketplaceDictionary["common"], "saving">;
}) {
  const [updateState, updateAction, updatePending] = useActionState(
    adminUpdatePracticeAreaAction,
    initial,
  );
  const [toggleState, toggleAction, togglePending] = useActionState(
    adminTogglePracticeAreaActiveAction,
    initial,
  );

  return (
    <div className="grid gap-2 border-b py-3 last:border-b-0 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center sm:gap-3">
      <form action={updateAction} className="contents">
        <input type="hidden" name="id" value={area.id} />
        <div>
          <label className="mb-1 block text-xs text-muted-foreground sm:hidden">
            {copy.nameMn}
          </label>
          <Input name="nameMn" defaultValue={area.nameMn} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground sm:hidden">
            {copy.nameEn}
          </label>
          <Input name="nameEn" defaultValue={area.nameEn} />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={updatePending}>
          {updatePending ? copy.saving : copy.save}
        </Button>
      </form>
      <form action={toggleAction}>
        <input type="hidden" name="id" value={area.id} />
        <input
          type="hidden"
          name="isActive"
          value={area.isActive ? "false" : "true"}
        />
        <Button
          type="submit"
          size="sm"
          variant={area.isActive ? "outline" : "default"}
          disabled={togglePending}
        >
          {togglePending ? "…" : area.isActive ? copy.deactivate : copy.activate}
        </Button>
      </form>
      {updateState.error ? (
        <p className="text-xs text-destructive sm:col-span-4">
          {updateState.error}
        </p>
      ) : null}
      {toggleState.error ? (
        <p className="text-xs text-destructive sm:col-span-4">
          {toggleState.error}
        </p>
      ) : null}
    </div>
  );
}
