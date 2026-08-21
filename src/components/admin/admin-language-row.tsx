"use client";

import { useActionState } from "react";

import type { ActionState } from "@/application/common/action-state";
import {
  adminToggleLanguageActiveAction,
  adminUpdateLanguageAction,
} from "@/application/actions/admin-taxonomy.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Language } from "@/domain/entities/taxonomy";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

const initial: ActionState = {};

export function AdminLanguageRow({
  language,
  copy,
}: {
  language: Language;
  copy: MarketplaceDictionary["adminTaxonomy"] &
    Pick<MarketplaceDictionary["common"], "saving">;
}) {
  const [updateState, updateAction, updatePending] = useActionState(
    adminUpdateLanguageAction,
    initial,
  );
  const [toggleState, toggleAction, togglePending] = useActionState(
    adminToggleLanguageActiveAction,
    initial,
  );

  return (
    <div className="grid gap-2 border-b py-3 last:border-b-0 sm:grid-cols-[5rem_1fr_1fr_auto_auto] sm:items-center sm:gap-3">
      <span className="text-sm font-medium text-muted-foreground">
        {language.code}
      </span>
      <form action={updateAction} className="contents">
        <input type="hidden" name="id" value={language.id} />
        <Input name="nameMn" defaultValue={language.nameMn} />
        <Input name="nameEn" defaultValue={language.nameEn} />
        <Button type="submit" size="sm" variant="outline" disabled={updatePending}>
          {updatePending ? copy.saving : copy.save}
        </Button>
      </form>
      <form action={toggleAction}>
        <input type="hidden" name="id" value={language.id} />
        <input
          type="hidden"
          name="isActive"
          value={language.isActive ? "false" : "true"}
        />
        <Button
          type="submit"
          size="sm"
          variant={language.isActive ? "outline" : "default"}
          disabled={togglePending}
        >
          {togglePending
            ? "…"
            : language.isActive
              ? copy.deactivate
              : copy.activate}
        </Button>
      </form>
      {updateState.error ? (
        <p className="text-xs text-destructive sm:col-span-5">
          {updateState.error}
        </p>
      ) : null}
      {toggleState.error ? (
        <p className="text-xs text-destructive sm:col-span-5">
          {toggleState.error}
        </p>
      ) : null}
    </div>
  );
}
