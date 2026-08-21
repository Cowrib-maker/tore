"use client";

import { useActionState } from "react";

import { createCaseFileAction } from "@/application/actions/case-review.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeTextarea } from "@/components/ui/native-select";
import { LegalDomain } from "@/engine/doctrine";

export function CreateCaseFileForm() {
  const [state, action, pending] = useActionState(createCaseFileAction, {});

  return (
    <form
      action={action}
      data-testid="create-case-form"
      className="ds-surface grid gap-3 rounded-xl p-4 sm:grid-cols-2"
    >
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required maxLength={200} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="legalDomain">Legal domain</Label>
        <NativeSelect id="legalDomain" name="legalDomain" required defaultValue="CIVIL">
          {Object.values(LegalDomain).map((domain) => (
            <option key={domain} value={domain}>
              {domain}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="applicableAt">applicableAt (optional)</Label>
        <Input id="applicableAt" name="applicableAt" type="date" />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="description">Description (optional)</Label>
        <NativeTextarea id="description" name="description" rows={3} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Creating…" : "Create case"}
        </Button>
        {state.error ? (
          <p className="mt-2 text-sm text-destructive">{state.error}</p>
        ) : null}
      </div>
    </form>
  );
}
