"use client";

import { useActionState, useEffect, useRef } from "react";

import type { ActionState } from "@/application/common/action-state";
import { adminCreatePracticeAreaAction } from "@/application/actions/admin-taxonomy.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

const initial: ActionState = {};

export function AdminCreatePracticeAreaForm({
  copy,
}: {
  copy: MarketplaceDictionary["adminTaxonomy"] &
    Pick<MarketplaceDictionary["common"], "saving">;
}) {
  const [state, formAction, pending] = useActionState(
    adminCreatePracticeAreaAction,
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
      className="grid gap-3 rounded-lg border border-dashed p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
    >
      <div>
        <Label htmlFor="pa-slug" className="mb-1 text-xs">
          {copy.slug}
        </Label>
        <Input id="pa-slug" name="slug" placeholder="civil-law" required />
      </div>
      <div>
        <Label htmlFor="pa-nameMn" className="mb-1 text-xs">
          {copy.nameMn}
        </Label>
        <Input id="pa-nameMn" name="nameMn" required />
      </div>
      <div>
        <Label htmlFor="pa-nameEn" className="mb-1 text-xs">
          {copy.nameEn}
        </Label>
        <Input id="pa-nameEn" name="nameEn" required />
      </div>
      <div className="flex items-end">
        <Button type="submit" size="sm" disabled={pending} className="w-full">
          {pending ? copy.saving : copy.addPracticeArea}
        </Button>
      </div>
      {state.error ? (
        <p className="text-xs text-destructive sm:col-span-4">{state.error}</p>
      ) : null}
    </form>
  );
}
