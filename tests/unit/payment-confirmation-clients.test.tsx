// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/legal-ai",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/application/actions/session.actions", () => ({
  revokeDeviceSessionAction: vi.fn(),
  revokeOtherDeviceSessionsAction: vi.fn(),
}));

import { BillingAndSessionsPanel } from "@/components/account/billing-and-sessions-panel";
import { LegalAiAccessGateCard } from "@/components/legal-ai/legal-ai-access-gate";
import { ConsultationPaymentCard } from "@/components/marketplace/consultation-payment-card";
import { marketplaceMn } from "@/i18n/dictionaries/marketplace/mn";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver ??= ResizeObserverStub;
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** What GET /api/{lawyer,citizen}/billing/invoices/:id returns for an unverified invoice while the ACCOUNT has an active subscription. */
const unverifiedButAccountActive = { paid: false, invoiceStatus: "PENDING", subscriptionStatus: "ACTIVE", invoice: { status: "PENDING" } };
const confirmed = { paid: true, invoiceStatus: "PAID", subscriptionStatus: "ACTIVE", invoice: { status: "PAID" } };

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("Legal AI access gate: payment confirmation", () => {
  const checkout = {
    invoiceId: "inv-1",
    qrImage: null,
    shortUrl: "https://qpay.mn/s/x",
    amountMnt: 49_000,
    planCode: "SOLO",
    audience: "lawyer" as const,
    method: "QPAY" as const,
    status: "PENDING",
  };

  function stub(invoice: () => unknown) {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url === "/api/ai/entitlement") return json({ remainingLegalQuestions: 0 });
        if (url.startsWith("/api/lawyer/billing/invoices/")) return json(invoice());
        return json({}, 404);
      }),
    );
    return calls;
  }

  it("does NOT treat paid:false + account subscriptionStatus ACTIVE as paid: no onPaid, no 'payment confirmed'", async () => {
    const calls = stub(() => unverifiedButAccountActive);
    const onPaid = vi.fn();
    render(<LegalAiAccessGateCard gate={{ kind: "billing", question: "Q?", message: "m", audience: "lawyer", checkout }} onPaid={onPaid} />);
    await advance(10_000);
    expect(calls.some((c) => c.startsWith("/api/lawyer/billing/invoices/inv-1"))).toBe(true); // the poll really ran
    expect(onPaid).not.toHaveBeenCalled();
    expect(screen.queryByText(/Төлбөр баталгаажлаа/)).toBeNull();
  });

  it("treats a server-confirmed payment (paid:true) as paid, exactly once", async () => {
    stub(() => confirmed);
    const onPaid = vi.fn();
    render(<LegalAiAccessGateCard gate={{ kind: "billing", question: "Q?", message: "m", audience: "lawyer", checkout }} onPaid={onPaid} />);
    await advance(10_000);
    expect(onPaid).toHaveBeenCalledTimes(1);
  });
});

describe("Consultation payment card: payment confirmation", () => {
  const props = { invoiceId: "inv-c1", amountMnt: 120_000, qrImage: null, shortUrl: null };

  it("keeps waiting when paid:false even though the account subscriptionStatus is ACTIVE", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(unverifiedButAccountActive)));
    render(<ConsultationPaymentCard {...props} />);
    await advance(10_000);
    expect(screen.queryByText("Төлбөр амжилттай.")).toBeNull();
    expect(screen.getByText(/QPay-ээр төлнө үү/)).toBeTruthy();
  });

  it("shows success only after the server confirms the payment (paid:true)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(confirmed)));
    render(<ConsultationPaymentCard {...props} />);
    await advance(4_000);
    expect(screen.getByText("Төлбөр амжилттай.")).toBeTruthy();
  });
});

describe("Account billing panel: payment confirmation", () => {
  const copy = marketplaceMn.account;
  const base = {
    planCode: "SOLO",
    planName: "TORE Lawyer",
    priceMnt: 49_000,
    seatLimit: 1,
    billingRequired: false,
    subscriptionStatus: "ACTIVE",
    expiresAt: "2030-01-15T00:00:00.000Z",
    pendingInvoice: null,
    usage: {
      caseAnalysis: { used: 0, limit: 10 },
      documentAnalysis: { used: 0, limit: 10 },
      legalAiQueries: { used: 0, limit: 100 },
    },
    riskState: "NORMAL",
    warning: null,
    sessions: [],
    currentSessionId: "s1",
  };
  const pendingInvoice = {
    invoiceId: "inv-1", amountMnt: 49_000, currency: "MNT", status: "PENDING", qrText: null, qrImage: null, shortUrl: "https://qpay.mn/s/x", deeplinks: [],
  };

  function stub(snapshot: () => unknown, invoice?: () => unknown) {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url === "/api/lawyer/billing") return json(snapshot());
        if (url.startsWith("/api/lawyer/billing/invoices/")) return json(invoice?.() ?? {});
        return json({}, 404);
      }),
    );
    return calls;
  }

  it("an account that is simply ACTIVE does not show 'payment confirmed' on load (nothing was paid this visit)", async () => {
    stub(() => base);
    render(<BillingAndSessionsPanel copy={copy} locale="mn" supportEmail="support@example.mn" />);
    await advance(500);
    expect(await screen.findByText(copy.statusActive)).toBeTruthy();
    expect(screen.queryByText(copy.paymentSuccess)).toBeNull();
  });

  it("an unverified invoice with an ACTIVE account subscription is not treated as paid (no reload of the snapshot)", async () => {
    const calls = stub(
      () => ({ ...base, billingRequired: true, subscriptionStatus: "PENDING", pendingInvoice }),
      () => unverifiedButAccountActive,
    );
    render(<BillingAndSessionsPanel copy={copy} locale="mn" supportEmail="support@example.mn" />);
    await advance(10_000);
    expect(calls.some((c) => c.startsWith("GET /api/lawyer/billing/invoices/inv-1"))).toBe(true);
    // Only the initial snapshot load: a "paid" verdict would have triggered load() again.
    expect(calls.filter((c) => c === "GET /api/lawyer/billing")).toHaveLength(1);
    expect(screen.queryByText(copy.paymentSuccess)).toBeNull();
  });

  it("a server-confirmed payment reloads the snapshot and shows the success message", async () => {
    let paid = false;
    stub(
      () => (paid ? base : { ...base, billingRequired: true, subscriptionStatus: "PENDING", pendingInvoice }),
      () => {
        paid = true;
        return confirmed;
      },
    );
    render(<BillingAndSessionsPanel copy={copy} locale="mn" supportEmail="support@example.mn" />);
    await advance(5_000);
    expect(await screen.findByText(copy.paymentSuccess)).toBeTruthy();
  });
});
