"use client";

import { useActionState } from "react";

import { switchActiveContextAction } from "@/application/actions/active-context.actions";
import type { ActionState } from "@/application/common/action-state";
import { ActiveContextType } from "@/domain/enums";
import type { Dictionary } from "@/i18n/types";

type Copy = Dictionary["activeContext"];

type Option = {
  value: string;
  label: string;
};

const initial: ActionState = {};

export function ActiveContextSwitcher({
  currentType,
  currentOrganizationId,
  personalAvailable,
  organizations,
  copy,
}: {
  currentType: ActiveContextType;
  currentOrganizationId?: string;
  personalAvailable: boolean;
  organizations: Array<{ id: string; name: string }>;
  copy: Copy;
}) {
  const [state, action, pending] = useActionState(
    switchActiveContextAction,
    initial,
  );

  const currentValue =
    currentType === ActiveContextType.ORGANIZATION && currentOrganizationId
      ? `org:${currentOrganizationId}`
      : "personal";

  const options: Option[] = [];
  if (personalAvailable) {
    options.push({ value: "personal", label: copy.personal });
  }
  for (const org of organizations) {
    options.push({ value: `org:${org.id}`, label: org.name });
  }

  if (options.length === 0) {
    return null;
  }

  return (
    <form action={action} className="flex flex-col gap-1">
      <label htmlFor="active-context" className="sr-only">
        {copy.label}
      </label>
      <select
        id="active-context"
        name="target"
        defaultValue={currentValue}
        disabled={pending}
        className="h-9 max-w-[14rem] rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        onChange={(event) => {
          event.currentTarget.form?.requestSubmit();
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {state.error ? (
        <p className="text-xs text-destructive">{state.error}</p>
      ) : null}
    </form>
  );
}
