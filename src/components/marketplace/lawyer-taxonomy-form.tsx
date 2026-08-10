"use client";

import { useActionState } from "react";

import type { ActionState } from "@/application/common/action-state";
import { setLawyerTaxonomyAction } from "@/application/actions/marketplace.actions";
import { Button } from "@/components/ui/button";
import type { Language, PracticeArea } from "@/domain/entities/taxonomy";
import type { Locale } from "@/i18n/config";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";
import { localizedTaxonomyName } from "@/lib/localized-content";

const initialState: ActionState = {};

export function LawyerTaxonomyForm({
  practiceAreas,
  languages,
  selectedPracticeAreaIds,
  selectedLanguageIds,
  copy,
  locale,
}: {
  practiceAreas: PracticeArea[];
  languages: Language[];
  selectedPracticeAreaIds: string[];
  selectedLanguageIds: string[];
  copy: MarketplaceDictionary["taxonomyForm"] &
    Pick<MarketplaceDictionary["common"], "saving">;
  locale: Locale;
}) {
  const [state, formAction, pending] = useActionState(
    setLawyerTaxonomyAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div
          id="lawyer-taxonomy-form-error"
          role="alert"
          aria-live="assertive"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
          {copy.saved}
        </div>
      )}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{copy.practiceAreas}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {practiceAreas.map((area) => (
            <label key={area.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="practiceAreaIds"
                value={area.id}
                defaultChecked={selectedPracticeAreaIds.includes(area.id)}
              />
              {localizedTaxonomyName(area, locale)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{copy.languages}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {languages.map((lang) => (
            <label key={lang.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="languageIds"
                value={lang.id}
                defaultChecked={selectedLanguageIds.includes(lang.id)}
              />
              {localizedTaxonomyName(lang, locale)}
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" disabled={pending}>
        {pending ? copy.saving : copy.save}
      </Button>
    </form>
  );
}
