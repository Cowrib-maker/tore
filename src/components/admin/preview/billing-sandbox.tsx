"use client";

import { useState } from "react";

import { BillingCenter, type Role } from "@/components/billing/billing-center";
import { Button } from "@/components/ui/button";
import {
  BILLING_PREVIEW_SCENARIOS,
  createSimulatedBilling,
  type BillingPreviewScenarioId,
  type BillingSimEvent,
} from "@/domain/admin-preview/billing-simulation";
import type { Locale } from "@/i18n/config";

const EVENTS: ReadonlyArray<{ event: BillingSimEvent; label: string }> = [
  { event: "confirm-paid", label: "Төлбөр амжилттай болгох (симуляци)" },
  { event: "fail", label: "Амжилтгүй болгох" },
  { event: "expire", label: "Хугацаа дуусгах" },
  { event: "cancel", label: "Цуцлах" },
  { event: "reset", label: "Анхны төлөв рүү" },
];

/**
 * Renders the REAL BillingCenter with an in-memory transport. No request leaves the browser for billing: the component's
 * `transport` prop replaces its HTTP API, so QPay, invoices, callbacks and entitlements are unreachable from here.
 */
export function BillingSandbox({
  role,
  scenario,
  nowIso,
  locale,
}: {
  role: Role;
  scenario: BillingPreviewScenarioId;
  nowIso: string;
  locale: Locale;
}) {
  const [sim] = useState(() => createSimulatedBilling(role, scenario, nowIso));
  const [version, setVersion] = useState(0);
  const [log, setLog] = useState<string[]>([]);

  function fire(event: BillingSimEvent) {
    const result = sim.apply(event);
    setLog((current) => [`${event}${result ? ` → ${result}` : ""}`, ...current].slice(0, 6));
    setVersion((v) => v + 1);
  }

  return (
    <div className="space-y-4">
      <section aria-label="Симуляцийн удирдлага" className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
        <p className="font-bold">TEST / SIMULATED — төлбөрийн симуляцийн удирдлага</p>
        <p className="text-xs">
          Төлөв: <strong>{BILLING_PREVIEW_SCENARIOS[scenario].label}</strong>. Эдгээр товч зөвхөн энэ хуудасны санах ойн төлөвийг өөрчилнө; бодит
          нэхэмжлэл, QPay, callback, багц, эрх хөндөгдөхгүй.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {EVENTS.map(({ event, label }) => (
            <Button key={event} type="button" size="sm" variant="outline" onClick={() => fire(event)}>
              {label}
            </Button>
          ))}
        </div>
        {log.length > 0 ? (
          <ol className="mt-2 list-decimal pl-5 text-xs" aria-label="Симуляцийн түүх">
            {log.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ol>
        ) : null}
      </section>
      <BillingCenter key={version} role={role} backHref="/admin/preview" locale={locale} transport={sim.transport} simulated />
    </div>
  );
}
