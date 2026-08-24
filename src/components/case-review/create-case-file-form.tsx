"use client";

import { useActionState } from "react";

import { createCaseFileAction } from "@/application/actions/case-review.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeTextarea } from "@/components/ui/native-select";
import { LegalDomain } from "@/engine/doctrine";

const DOMAIN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: LegalDomain.CIVIL, label: "Иргэний" },
  { value: LegalDomain.CRIMINAL, label: "Эрүүгийн" },
  { value: LegalDomain.ADMINISTRATIVE, label: "Захиргааны" },
  { value: LegalDomain.CONSTITUTIONAL, label: "Үндсэн хуулийн" },
  { value: LegalDomain.PROCEDURAL, label: "Процессын" },
  { value: LegalDomain.UNKNOWN, label: "Бусад" },
];

export function CreateCaseFileForm() {
  const [state, action, pending] = useActionState(createCaseFileAction, {});

  return (
    <form
      action={action}
      data-testid="create-case-form"
      className="grid gap-3 rounded-2xl border border-[#0B1F3A]/8 bg-white p-5 sm:grid-cols-2"
    >
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="title">Хэргийн нэр</Label>
        <Input id="title" name="title" required maxLength={200} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="legalDomain">Эрх зүйн салбар</Label>
        <NativeSelect id="legalDomain" name="legalDomain" required defaultValue="CIVIL">
          {DOMAIN_OPTIONS.map((domain) => (
            <option key={domain.value} value={domain.value}>
              {domain.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="applicableAt">Хэрэглэх огноо (заавал биш)</Label>
        <Input id="applicableAt" name="applicableAt" type="date" />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="description">Тайлбар (заавал биш)</Label>
        <NativeTextarea id="description" name="description" rows={3} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Үүсгэж байна…" : "Хэрэг үүсгэх"}
        </Button>
        {state.error ? (
          <p className="mt-2 text-sm text-destructive">{state.error}</p>
        ) : null}
      </div>
    </form>
  );
}
