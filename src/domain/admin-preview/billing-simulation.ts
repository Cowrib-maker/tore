import type {
  BillingTransport,
  CheckoutMethod,
  CheckoutResult,
  CitizenPayload,
  InvoiceStatusPayload,
  LawyerPayload,
  PendingInvoice,
  Role,
} from "@/components/billing/billing-center";
import {
  CITIZEN_PLANS,
  SOLO_PLAN,
  getPlanDefinition,
  type SubscriptionPlanDefinition,
} from "@/domain/constants/subscription-plans";
import { SubscriptionPlanCode } from "@/domain/enums";

/**
 * In-memory payment simulation for the admin checkout preview.
 *
 * ISOLATION RULES (enforced by tests/unit/admin-billing-preview.test.ts):
 *  - This module imports ONLY the plan catalog, enums and component *types*. It must never import the QPay gateway, the
 *    billing unit of work, invoice/subscription repositories, activation or payment-verification use cases.
 *  - Nothing here performs I/O. There is no fetch, no database, no callback. "Paying" only changes a local object.
 *  - Every invoice id / reference / QR produced here is prefixed `SIM-` / marked TEST so it can never be mistaken for, or
 *    collide with, a real invoice.
 * Prices, quotas and names are read from the SAME catalog the real checkout uses (subscription-plans.ts).
 */

export const SIMULATED_ID_PREFIX = "SIM-";

export const BILLING_PREVIEW_SCENARIO_IDS = [
  "no-plan",
  "pending-payment",
  "awaiting-verification",
  "active",
  "payment-failed",
  "invoice-expired",
  "invoice-cancelled",
  "subscription-expired",
] as const;
export type BillingPreviewScenarioId = (typeof BILLING_PREVIEW_SCENARIO_IDS)[number];

export const BILLING_PREVIEW_SCENARIOS: Record<BillingPreviewScenarioId, { label: string; description: string }> = {
  "no-plan": { label: "Багцгүй — багц сонгох", description: "Идэвхтэй багцгүй, багц сонгох дэлгэц." },
  "pending-payment": { label: "Төлбөр хүлээгдэж байна", description: "Нэхэмжлэл үүссэн, төлбөр хүлээж буй (pending)." },
  "awaiting-verification": { label: "Төлбөр шалгагдаж байна", description: "«Төлбөр хийсэн» дарсан, админ баталгаажуулалт хүлээж буй." },
  active: { label: "Идэвхтэй багц (амжилттай)", description: "Төлбөр баталгаажиж, багц идэвхжсэн." },
  "payment-failed": { label: "Төлбөр амжилтгүй", description: "Төлбөр баталгаажаагүй (failed)." },
  "invoice-expired": { label: "Нэхэмжлэлийн хугацаа дууссан", description: "Төлөөгүй нэхэмжлэл хугацаа хэтэрсэн (expired)." },
  "invoice-cancelled": { label: "Нэхэмжлэл цуцлагдсан", description: "Нэхэмжлэл цуцлагдсан (cancelled)." },
  "subscription-expired": { label: "Багцын хугацаа дууссан — сунгах", description: "Өмнө идэвхтэй байсан багц дууссан, сунгах шаардлагатай." },
};

/** Events the admin can fire from the simulation panel. They only mutate the in-memory state below. */
export const BILLING_SIM_EVENTS = ["confirm-paid", "fail", "expire", "cancel", "reset"] as const;
export type BillingSimEvent = (typeof BILLING_SIM_EVENTS)[number];

export function isBillingPreviewScenario(value: unknown): value is BillingPreviewScenarioId {
  return typeof value === "string" && (BILLING_PREVIEW_SCENARIO_IDS as readonly string[]).includes(value);
}

/** Obviously-not-a-QR placeholder: diagonal stripes and a big TEST label. It cannot be scanned into a real payment. */
export const SIMULATED_QR_DATA_URL = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="224" height="224" viewBox="0 0 224 224"><defs><pattern id="s" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="16" fill="#fde68a"/></pattern></defs><rect width="224" height="224" fill="url(#s)"/><rect x="22" y="84" width="180" height="56" fill="#fff" stroke="#92400e" stroke-width="3"/><text x="112" y="108" text-anchor="middle" font-family="monospace" font-size="18" font-weight="700" fill="#92400e">TEST / SIMULATED</text><text x="112" y="128" text-anchor="middle" font-family="monospace" font-size="11" fill="#92400e">NOT A REAL QR</text></svg>',
)}`;

const SIM_BANK = {
  bankName: "ТЕСТ БАНК (жишээ)",
  bankAccountNumber: "0000 0000 (жишээ)",
  bankAccountName: "TORE ТЕСТ (жишээ)",
};

type SimInvoiceStatus = "PENDING" | "AWAITING_VERIFICATION" | "PAID" | "FAILED" | "EXPIRED" | "CANCELLED";

type SimInvoice = {
  id: string;
  planCode: string | null;
  amountMnt: number;
  status: SimInvoiceStatus;
  method: CheckoutMethod;
  createdAt: string;
};

type SimState = {
  active: boolean;
  everActive: boolean;
  planCode: string | null;
  periodEnd: string | null;
  invoice: SimInvoice | null;
  history: SimInvoice[];
  seq: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function planFor(role: Role, planCode: string | null): SubscriptionPlanDefinition {
  if (role === "lawyer") return SOLO_PLAN;
  return getPlanDefinition((planCode as SubscriptionPlanCode | null) ?? SubscriptionPlanCode.CITIZEN_BASIC);
}

function simInvoice(
  state: Pick<SimState, "seq">,
  role: Role,
  planCode: string | null,
  status: SimInvoiceStatus,
  method: CheckoutMethod,
  now: Date,
  ageDays = 0,
): SimInvoice {
  const plan = planFor(role, planCode);
  return {
    id: `${SIMULATED_ID_PREFIX}${String(state.seq).padStart(6, "0")}`,
    planCode: plan.code,
    amountMnt: plan.priceMnt,
    status,
    method,
    createdAt: new Date(now.getTime() - ageDays * DAY_MS).toISOString(),
  };
}

function initialState(role: Role, scenario: BillingPreviewScenarioId, now: Date): SimState {
  const base: SimState = { active: false, everActive: false, planCode: null, periodEnd: null, invoice: null, history: [], seq: 1 };
  const code = planFor(role, null).code;
  const make = (status: SimInvoiceStatus, ageDays = 0) => {
    const invoice = simInvoice(base, role, code, status, "QR", now, ageDays);
    base.seq += 1;
    return invoice;
  };
  switch (scenario) {
    case "no-plan":
      return base;
    case "pending-payment":
      base.invoice = make("PENDING");
      return base;
    case "awaiting-verification":
      base.invoice = make("AWAITING_VERIFICATION");
      return base;
    case "active": {
      const paid = make("PAID", 2);
      return { ...base, active: true, everActive: true, planCode: code, periodEnd: new Date(now.getTime() + 28 * DAY_MS).toISOString(), history: [paid] };
    }
    case "payment-failed":
      base.invoice = make("FAILED");
      return base;
    case "invoice-expired":
      base.invoice = make("EXPIRED", 1);
      return base;
    case "invoice-cancelled":
      base.invoice = make("CANCELLED", 1);
      return base;
    case "subscription-expired": {
      const paid = make("PAID", 35);
      return { ...base, everActive: true, planCode: code, periodEnd: new Date(now.getTime() - 5 * DAY_MS).toISOString(), history: [paid] };
    }
  }
}

function toPending(invoice: SimInvoice): PendingInvoice {
  const isQr = invoice.method === "QR";
  return {
    invoiceId: invoice.id,
    planCode: invoice.planCode,
    amountMnt: invoice.amountMnt,
    status: invoice.status,
    method: invoice.method,
    reference: `${SIMULATED_ID_PREFIX}${invoice.id.slice(-4)}`,
    paymentCode: null,
    ...SIM_BANK,
    qrAssetUrl: isQr ? SIMULATED_QR_DATA_URL : null,
    qrImage: null,
    shortUrl: null,
  };
}

function toHistory(invoice: SimInvoice) {
  return {
    id: invoice.id,
    planCode: invoice.planCode,
    planName: invoice.planCode ? getPlanDefinition(invoice.planCode as SubscriptionPlanCode).name : null,
    amountMnt: invoice.amountMnt,
    status: invoice.status,
    provider: "SIMULATED",
    method: invoice.method,
    paymentCode: null,
    createdAt: invoice.createdAt,
  };
}

/** Pure payload builder: same shapes the real /api/{citizen,lawyer}/billing endpoints return. */
export function buildSimulatedPayload(role: Role, state: SimState): CitizenPayload | LawyerPayload {
  const pending = state.invoice && state.invoice.status !== "PAID" ? toPending(state.invoice) : null;
  const history = [...(state.invoice ? [state.invoice] : []), ...state.history].map(toHistory);
  const billingRequired = !state.active;
  if (role === "lawyer") {
    return {
      planName: SOLO_PLAN.name,
      priceMnt: SOLO_PLAN.priceMnt,
      billingRequired,
      subscriptionStatus: state.active ? "ACTIVE" : state.everActive ? "EXPIRED" : "PENDING",
      expiresAt: state.periodEnd,
      pendingInvoice: pending,
      history,
    };
  }
  const plan = planFor(role, state.planCode);
  return {
    audience: "citizen",
    planName: state.active ? plan.name : null,
    statusLabel: state.active ? "ACTIVE" : state.everActive ? "EXPIRED" : "NONE",
    remainingLegalQuestions: state.active ? plan.quotas.legalAiQueries : 0,
    currentPeriodEnd: state.periodEnd,
    billingRequired,
    availablePlans: CITIZEN_PLANS.map((code) => {
      const p = getPlanDefinition(code);
      return { code: p.code, name: p.name, priceMnt: p.priceMnt, quotas: { legalAiQueries: p.quotas.legalAiQueries, documentAnalysis: p.quotas.documentAnalysis } };
    }),
    pendingInvoice: pending,
    history,
  };
}

export type SimulatedBilling = {
  transport: BillingTransport;
  /** Applies an admin simulation event. Returns the new invoice status (or null) for the panel log. */
  apply(event: BillingSimEvent): string | null;
  snapshot(): SimState;
  /** Counts transport calls — lets tests prove nothing outside this object was reached. */
  readonly calls: { load: number; checkout: number; invoiceStatus: number; claim: number };
};

export function createSimulatedBilling(role: Role, scenario: BillingPreviewScenarioId, nowIso: string): SimulatedBilling {
  const now = new Date(nowIso);
  let state = initialState(role, scenario, now);
  const calls = { load: 0, checkout: 0, invoiceStatus: 0, claim: 0 };

  const transport: BillingTransport = {
    async load() {
      calls.load += 1;
      return buildSimulatedPayload(role, state);
    },
    async checkout({ planCode, method }): Promise<CheckoutResult> {
      calls.checkout += 1;
      if (state.active) return { ok: false, view: { error: "Багц идэвхтэй байна (симуляци)." } };
      if (role === "citizen" && !CITIZEN_PLANS.includes(planCode as SubscriptionPlanCode)) {
        return { ok: false, view: { error: "Багц буруу байна (симуляци)." } };
      }
      const invoice = simInvoice(state, role, planCode, "PENDING", method, now);
      state = { ...state, invoice, seq: state.seq + 1 };
      const pending = toPending(invoice);
      return { ok: true, view: { ...pending, planCode: pending.planCode ?? undefined } };
    },
    async invoiceStatus(invoiceId): Promise<InvoiceStatusPayload | null> {
      calls.invoiceStatus += 1;
      if (state.history.some((row) => row.id === invoiceId && row.status === "PAID")) {
        return { paid: true, subscriptionStatus: "ACTIVE", invoiceStatus: "PAID" };
      }
      if (!state.invoice || state.invoice.id !== invoiceId) return null;
      return { paid: false, invoiceStatus: state.invoice.status };
    },
    async claim(invoiceId) {
      calls.claim += 1;
      if (!state.invoice || state.invoice.id !== invoiceId || state.invoice.status !== "PENDING") {
        return { ok: false, error: "Энэ нэхэмжлэлд хүсэлт илгээх боломжгүй (симуляци)." };
      }
      state = { ...state, invoice: { ...state.invoice, status: "AWAITING_VERIFICATION" } };
      return { ok: true };
    },
  };

  return {
    transport,
    calls,
    snapshot: () => state,
    apply(event) {
      if (event === "reset") {
        state = initialState(role, scenario, now);
        return null;
      }
      if (!state.invoice) return null;
      const invoice = state.invoice;
      if (event === "confirm-paid") {
        const paid: SimInvoice = { ...invoice, status: "PAID" };
        state = {
          ...state,
          active: true,
          everActive: true,
          planCode: invoice.planCode,
          periodEnd: new Date(now.getTime() + 30 * DAY_MS).toISOString(),
          invoice: null,
          history: [paid, ...state.history],
        };
        return "PAID";
      }
      const next: SimInvoiceStatus = event === "fail" ? "FAILED" : event === "expire" ? "EXPIRED" : "CANCELLED";
      state = { ...state, invoice: { ...invoice, status: next } };
      return next;
    },
  };
}
