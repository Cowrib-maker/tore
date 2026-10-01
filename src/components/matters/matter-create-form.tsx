"use client";

import { useActionState } from "react";

import { createMatterAction } from "@/application/actions/matter.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeTextarea } from "@/components/ui/native-select";

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "GENERAL", label: "Ерөнхий" },
  { value: "LITIGATION", label: "Маргаан, шүүх" },
  { value: "CONTRACT", label: "Гэрээ" },
  { value: "EMPLOYMENT", label: "Хөдөлмөр" },
  { value: "FAMILY", label: "Гэр бүл" },
  { value: "CRIMINAL", label: "Эрүүгийн" },
  { value: "ADMINISTRATIVE", label: "Захиргааны" },
];

export function MatterCreateForm() {
  const [state, action, pending] = useActionState(createMatterAction, {});

  return (
    <form
      action={action}
      data-testid="create-matter-form"
      className="grid gap-3 rounded-2xl border border-[#0B1F3A]/8 bg-white p-5 sm:grid-cols-2"
    >
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="title">Хэргийн нэр</Label>
        <Input
          id="title"
          name="title"
          required
          maxLength={200}
          placeholder="Жишээ нь: Н.Ажилтны хөдөлмөрийн маргаан"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="type">Төрөл</Label>
        <NativeSelect id="type" name="type" defaultValue="GENERAL">
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="description">Тайлбар (заавал биш)</Label>
        <NativeTextarea
          id="description"
          name="description"
          rows={3}
          maxLength={4000}
        />
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
