"use client";

import { useActionState } from "react";

import type { ActionState } from "@/application/common/action-state";
import { adminUpdateSettingAction } from "@/application/actions/admin-settings.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PlatformSetting } from "@/domain/entities/platform-setting";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

const initial: ActionState = {};

export function AdminSettingRow({
  setting,
  copy,
}: {
  setting: PlatformSetting;
  copy: MarketplaceDictionary["adminSettings"] &
    Pick<MarketplaceDictionary["common"], "saving">;
}) {
  const [state, formAction, pending] = useActionState(
    adminUpdateSettingAction,
    initial,
  );

  return (
    <div className="border-b py-4 last:border-b-0">
      <div className="mb-2">
        <p className="font-mono text-sm font-medium">{setting.key}</p>
        {setting.description ? (
          <p className="text-sm text-muted-foreground">
            {setting.description}
          </p>
        ) : null}
      </div>
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="key" value={setting.key} />
        <Input
          name="value"
          defaultValue={setting.value}
          className="max-w-xs"
        />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? copy.saving : copy.save}
        </Button>
        {state.success ? (
          <span className="text-xs text-emerald-700">{copy.saved}</span>
        ) : null}
        {state.error ? (
          <span className="text-xs text-destructive">{state.error}</span>
        ) : null}
      </form>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {copy.updatedAt} {setting.updatedAt.toISOString().slice(0, 10)}
      </p>
    </div>
  );
}
