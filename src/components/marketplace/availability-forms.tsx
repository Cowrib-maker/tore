"use client";

import { useActionState } from "react";

import type { ActionState } from "@/application/actions/auth.actions";
import {
  createAvailabilityExceptionAction,
  createAvailabilityRuleAction,
  deleteAvailabilityExceptionAction,
  deleteAvailabilityRuleAction,
} from "@/application/actions/marketplace.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type {
  AvailabilityException,
  AvailabilityRule,
} from "@/domain/entities/availability";
import { DayOfWeek } from "@/domain/enums";
import type { Locale } from "@/i18n/config";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";
import { formatWeekday } from "@/lib/format-labels";

const initialState: ActionState = {};

const DAYS = Object.values(DayOfWeek);

type AvailabilityCopy = MarketplaceDictionary["availabilityForm"] &
  Pick<MarketplaceDictionary["common"], "saving">;

export function CreateAvailabilityRuleForm({
  copy,
  locale,
}: {
  copy: AvailabilityCopy;
  locale: Locale;
}) {
  const [state, formAction, pending] = useActionState(
    createAvailabilityRuleAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3 rounded-xl border p-4">
      <h3 className="font-medium">{copy.addRule}</h3>
      {state.error && (
        <div
          id="create-availability-rule-form-error"
          role="alert"
          aria-live="assertive"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
          {copy.ruleAdded}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="dayOfWeek">{copy.day}</Label>
          <NativeSelect
            id="dayOfWeek"
            name="dayOfWeek"
            defaultValue={DayOfWeek.MONDAY}
            aria-invalid={Boolean(state.error)}
            aria-describedby={
              state.error ? "create-availability-rule-form-error" : undefined
            }
          >
            {DAYS.map((day) => (
              <option key={day} value={day}>
                {formatWeekday(day, locale)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="startTime">{copy.start}</Label>
          <Input
            id="startTime"
            name="startTime"
            placeholder="09:00"
            pattern="\d{2}:\d{2}"
            required
            defaultValue="09:00"
            aria-invalid={Boolean(state.error)}
            aria-describedby={
              state.error ? "create-availability-rule-form-error" : undefined
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="endTime">{copy.end}</Label>
          <Input
            id="endTime"
            name="endTime"
            placeholder="17:00"
            pattern="\d{2}:\d{2}"
            required
            defaultValue="17:00"
            aria-invalid={Boolean(state.error)}
            aria-describedby={
              state.error ? "create-availability-rule-form-error" : undefined
            }
          />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? copy.saving : copy.addRuleBtn}
      </Button>
    </form>
  );
}

export function AvailabilityRuleList({
  rules,
  copy,
  locale,
}: {
  rules: AvailabilityRule[];
  copy: AvailabilityCopy;
  locale: Locale;
}) {
  return (
    <div className="space-y-2">
      {rules.length === 0 && (
        <div className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          {copy.emptyRules}
        </div>
      )}
      {rules.map((rule) => (
        <RuleRow key={rule.id} rule={rule} copy={copy} locale={locale} />
      ))}
    </div>
  );
}

function RuleRow({
  rule,
  copy,
  locale,
}: {
  rule: AvailabilityRule;
  copy: AvailabilityCopy;
  locale: Locale;
}) {
  const [state, formAction, pending] = useActionState(
    deleteAvailabilityRuleAction,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
    >
      <input type="hidden" name="ruleId" value={rule.id} />
      <span>
        {formatWeekday(rule.dayOfWeek, locale)} · {rule.startTime}–{rule.endTime}
        {!rule.isActive ? ` ${copy.inactive}` : ""}
      </span>
      {state.error && (
        <div
          id={`availability-rule-row-error-${rule.id}`}
          role="alert"
          aria-live="assertive"
          className="text-destructive"
        >
          {state.error}
        </div>
      )}
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {copy.remove}
      </Button>
    </form>
  );
}

export function CreateAvailabilityExceptionForm({
  copy,
}: {
  copy: AvailabilityCopy;
}) {
  const [state, formAction, pending] = useActionState(
    createAvailabilityExceptionAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3 rounded-xl border p-4">
      <h3 className="font-medium">{copy.addException}</h3>
      <p className="text-xs text-muted-foreground">{copy.exceptionHelp}</p>
      {state.error && (
        <div
          id="create-availability-exception-form-error"
          role="alert"
          aria-live="assertive"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
          {copy.exceptionSaved}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="exceptionDate">{copy.date}</Label>
          <Input
            id="exceptionDate"
            name="exceptionDate"
            type="date"
            required
            aria-invalid={Boolean(state.error)}
            aria-describedby={
              state.error ? "create-availability-exception-form-error" : undefined
            }
          />
        </div>
        <div className="flex items-end gap-2 pb-1">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isAvailable" />
            {copy.openWindow}
          </label>
        </div>
        <div className="space-y-1">
          <Label htmlFor="exStart">{copy.startOptional}</Label>
          <Input
            id="exStart"
            name="startTime"
            placeholder="10:00"
            aria-invalid={Boolean(state.error)}
            aria-describedby={
              state.error ? "create-availability-exception-form-error" : undefined
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="exEnd">{copy.endOptional}</Label>
          <Input
            id="exEnd"
            name="endTime"
            placeholder="12:00"
            aria-invalid={Boolean(state.error)}
            aria-describedby={
              state.error ? "create-availability-exception-form-error" : undefined
            }
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="reason">{copy.reason}</Label>
          <Input
            id="reason"
            name="reason"
            maxLength={500}
            aria-invalid={Boolean(state.error)}
            aria-describedby={
              state.error ? "create-availability-exception-form-error" : undefined
            }
          />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? copy.saving : copy.addExceptionBtn}
      </Button>
    </form>
  );
}

export function AvailabilityExceptionList({
  exceptions,
  copy,
}: {
  exceptions: AvailabilityException[];
  copy: AvailabilityCopy;
}) {
  return (
    <div className="space-y-2">
      {exceptions.length === 0 && (
        <div className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          {copy.emptyExceptions}
        </div>
      )}
      {exceptions.map((exception) => (
        <ExceptionRow key={exception.id} exception={exception} copy={copy} />
      ))}
    </div>
  );
}

function ExceptionRow({
  exception,
  copy,
}: {
  exception: AvailabilityException;
  copy: AvailabilityCopy;
}) {
  const [state, formAction, pending] = useActionState(
    deleteAvailabilityExceptionAction,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
    >
      <input type="hidden" name="exceptionId" value={exception.id} />
      <span>
        {exception.exceptionDate}
        {exception.isAvailable
          ? ` · ${copy.openLabel} ${exception.startTime ?? "?"}–${exception.endTime ?? "?"}`
          : ` · ${copy.blockedLabel}`}
        {exception.reason ? ` — ${exception.reason}` : ""}
      </span>
      {state.error && (
        <div
          id={`availability-exception-row-error-${exception.id}`}
          role="alert"
          aria-live="assertive"
          className="text-destructive"
        >
          {state.error}
        </div>
      )}
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {copy.remove}
      </Button>
    </form>
  );
}
