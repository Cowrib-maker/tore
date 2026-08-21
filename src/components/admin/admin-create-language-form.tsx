"use client";

import { useActionState, useEffect, useRef } from "react";

import type { ActionState } from "@/application/common/action-state";
import { adminCreateLanguageAction } from "@/application/actions/admin-taxonomy.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

const initial: ActionState = {};

export function AdminCreateLanguageForm({
  copy,
}: {
  copy: MarketplaceDictionary["adminTaxonomy"] &
    Pick<MarketplaceDictionary["common"], "saving">;
}) {
  const [state, formAction, pending] = useActionState(
    adminCreateLanguageAction,
    initial,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid gap-3 rounded-lg border border-dashed p-3 sm:grid-cols-[6rem_1fr_1fr_auto]"
    >
      <div>
        <Label htmlFor="lang-code" className="mb-1 text-xs">
          {copy.code}
        </Label>
        <Input id="lang-code" name="code" placeholder="fr" required />
      </div>
      <div>
        <Label htmlFor="lang-nameMn" className="mb-1 text-xs">
          {copy.nameMn}
        </Label>
        <Input id="lang-nameMn" name="nameMn" required />
      </div>
      <div>
        <Label htmlFor="lang-nameEn" className="mb-1 text-xs">
          {copy.nameEn}
        </Label>
        <Input id="lang-nameEn" name="nameEn" required />
      </div>
      <div className="flex items-end">
        <Button type="submit" size="sm" disabled={pending} className="w-full">
          {pending ? copy.saving : copy.addLanguage}
        </Button>
      </div>
      {state.error ? (
        <p className="text-xs text-destructive sm:col-span-4">{state.error}</p>
      ) : null}
    </form>
  );
}
