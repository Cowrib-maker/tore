// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const nav = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn(), pathname: "/legal-ai" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: nav.replace, refresh: nav.refresh, push: nav.push }),
}));

import { BillingCenter } from "@/components/billing/billing-center";
import { LawyerPlanStatusCard } from "@/components/billing/lawyer-plan-status-card";
import { LawyerWorkspaceFrame } from "@/components/case-review/lawyer-workspace-frame";
import { LawyerAiWorkbench } from "@/components/legal-ai/lawyer-ai-workbench";
import { LegalAiEntitlementBanner } from "@/components/legal-ai/legal-ai-entitlement-banner";

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver ??= ResizeObserverStub;
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
});

beforeEach(() => {
  nav.replace.mockReset();
  nav.refresh.mockReset();
  nav.push.mockReset();
  nav.pathname = "/legal-ai";
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const lawyerSnapshot = (over: Record<string, unknown> = {}) => ({
  planCode: "SOLO",
  planName: "TORE Lawyer",
  priceMnt: 49_000,
  billingRequired: true,
  subscriptionStatus: "NONE",
  expiresAt: null,
  pendingInvoice: null,
  history: [],
  usage: { legalAiQueries: { used: 3, limit: 100 } },
  ...over,
});

const entitlement = (over: Record<string, unknown> = {}) => ({
  audience: "lawyer",
  remainingLegalQuestions: 0,
  exhaustedNextStep: "billing",
  statusLabel: "TORE Lawyer",
  remainingLabel: "AI асуулт дууссан",
  exhaustedLabel: "Багц идэвхжүүлнэ үү.",
  ...over,
});

describe("1. active subscriber opens Legal AI directly", () => {
  it("shows no activation call to action or checkout when the lawyer has remaining allowance", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(entitlement({ remainingLegalQuestions: 40, remainingLabel: "AI асуулт: 40 үлдсэн" }))));
    render(<LegalAiEntitlementBanner onActivate={() => {}} />);
    expect(await screen.findByText("AI асуулт: 40 үлдсэн")).toBeTruthy();
    expect(screen.queryByText("Багц идэвхжүүлэх")).toBeNull();
  });
});

describe("2. inactive subscriber pays from the workspace context", () => {
  function stubWorkbenchFetch(extra: (url: string, init?: RequestInit) => Response | undefined) {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push(`${init?.method ?? "GET"} ${url}`);
        return extra(url, init) ?? (url.startsWith("/api/ai/entitlement") ? json(entitlement()) : json({}, 404));
      }),
    );
    return calls;
  }

  it("opens the plan checkout inside the chat (no navigation) and creates the invoice once even on double click", async () => {
    let resolveCheckout: (r: Response) => void = () => {};
    const calls = stubWorkbenchFetch((url, init) =>
      url === "/api/lawyer/billing/checkout" && init?.method === "POST"
        ? (new Promise<Response>((r) => (resolveCheckout = r)) as unknown as Response)
        : undefined,
    );
    render(<LawyerAiWorkbench caseContext={null} history={[]} />);

    fireEvent.click(await screen.findByRole("button", { name: "Багц идэвхжүүлэх" }));
    expect(await screen.findByText(/TORE Lawyer багц идэвхгүй байна/)).toBeTruthy();
    expect(nav.push).not.toHaveBeenCalled();

    const qr = screen.getByRole("radio", { name: /QR кодоор төлөх/ });
    fireEvent.click(qr);
    fireEvent.click(qr);
    fireEvent.click(qr);
    await act(async () => {
      resolveCheckout(json({ invoiceId: "inv-1", amountMnt: 49_000, planCode: "SOLO", method: "QR", status: "PENDING", reference: "1234" }));
    });
    expect(calls.filter((c) => c === "POST /api/lawyer/billing/checkout")).toHaveLength(1);
    expect(await screen.findByText(/1234/)).toBeTruthy();
    // Manual QR is never presented as automatically verified.
    expect(screen.getByRole("button", { name: "Төлбөр хийсэн" })).toBeTruthy();
    expect(screen.queryByText(/Төлбөр баталгаажлаа/)).toBeNull();
  });

  it("the gate's plan-and-history link keeps the current chat as the return destination", async () => {
    stubWorkbenchFetch(() => undefined);
    const assign = vi.fn();
    vi.stubGlobal("location", { pathname: "/legal-ai", search: "?conversationId=c1", assign });
    render(<LawyerAiWorkbench caseContext={null} history={[]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Багц идэвхжүүлэх" }));
    const link = await screen.findByRole("link", { name: "Багц ба төлбөрийн түүх" });
    expect(link.getAttribute("href")).toBe("/lawyer/billing?returnTo=%2Flegal-ai");
    fireEvent.click(link);
    expect(assign).toHaveBeenCalledWith("/lawyer/billing?returnTo=%2Flegal-ai%3FconversationId%3Dc1");
  });

  it("the banner links to the billing page with a return path when no in-context handler exists", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(entitlement())));
    render(<LegalAiEntitlementBanner />);
    const link = await screen.findByRole("link", { name: "Багц идэвхжүүлэх" });
    expect(link.getAttribute("href")).toBe("/lawyer/billing?returnTo=%2Flegal-ai");
  });
});

describe("3-6. payment outcomes on the billing page", () => {
  function billingFetch(opts: { snapshot: () => unknown; invoice?: () => unknown; onCheckout?: () => Response }) {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url === "/api/lawyer/billing" && !init?.method) return json(opts.snapshot());
        if (url.startsWith("/api/lawyer/billing/invoices/")) return json(opts.invoice?.() ?? {});
        if (url === "/api/lawyer/billing/checkout") return opts.onCheckout?.() ?? json({}, 500);
        return json({}, 404);
      }),
    );
    return calls;
  }
  const pending = {
    invoiceId: "inv-9", planCode: "SOLO", amountMnt: 49_000, status: "PENDING", method: "QPAY", reference: null, paymentCode: null,
    bankName: null, bankAccountNumber: null, bankAccountName: null, qrAssetUrl: null, qrImage: null, shortUrl: "https://qpay.mn/s/x",
  };

  it("4. a pending payment does not activate access or redirect", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    billingFetch({ snapshot: () => lawyerSnapshot({ pendingInvoice: pending }), invoice: () => ({ paid: false, invoiceStatus: "PENDING" }) });
    render(<BillingCenter role="lawyer" backHref="/lawyer/dashboard" locale="mn" returnTo="/legal-ai" />);
    expect(await screen.findByText("Төлбөр хүлээгдэж байна")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(9_500); });
    expect(screen.queryByText(/Төлбөр баталгаажлаа/)).toBeNull();
    expect(screen.getByText("Багц идэвхгүй байна")).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: /Үргэлжлүүлэх/ })).toBeNull();
  });

  it("3 + 6. a payment the SERVER reports as paid activates the plan and returns to the intended internal page", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let paid = false;
    billingFetch({
      snapshot: () => (paid ? lawyerSnapshot({ billingRequired: false, subscriptionStatus: "ACTIVE", expiresAt: "2030-01-01T00:00:00.000Z", pendingInvoice: null }) : lawyerSnapshot({ pendingInvoice: pending })),
      invoice: () => {
        paid = true;
        return { paid: true, subscriptionStatus: "ACTIVE" };
      },
    });
    render(<BillingCenter role="lawyer" backHref="/lawyer/dashboard" locale="mn" returnTo="/legal-ai?conversationId=c1" />);
    await screen.findByText("Төлбөр хүлээгдэж байна");
    await act(async () => { await vi.advanceTimersByTimeAsync(3_200); });
    expect(await screen.findByText(/Төлбөр баталгаажлаа/)).toBeTruthy();
    expect(screen.getByText("Идэвхтэй")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_600); });
    expect(nav.replace).toHaveBeenCalledWith("/legal-ai?conversationId=c1");
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("REGRESSION: paid:false with an account subscriptionStatus of ACTIVE is not proof this invoice is paid (no success banner, no redirect)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls = billingFetch({
      snapshot: () => lawyerSnapshot({ pendingInvoice: pending }),
      invoice: () => ({ paid: false, invoiceStatus: "PENDING", subscriptionStatus: "ACTIVE" }),
    });
    render(<BillingCenter role="lawyer" backHref="/lawyer/dashboard" locale="mn" returnTo="/legal-ai" />);
    await screen.findByText("Төлбөр хүлээгдэж байна");
    await act(async () => { await vi.advanceTimersByTimeAsync(9_500); });
    // The poll really ran and returned the misleading payload...
    expect(calls.filter((c) => c.startsWith("GET /api/lawyer/billing/invoices/")).length).toBeGreaterThan(0);
    // ...but nothing is presented as paid and nobody is redirected.
    expect(screen.queryByText(/Төлбөр баталгаажлаа/)).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(nav.refresh).not.toHaveBeenCalled();
    expect(screen.getByText("Төлбөр хүлээгдэж байна")).toBeTruthy();
  });

  it("a paid-looking page load alone (no server-confirmed payment this visit) never redirects automatically", async () => {
    billingFetch({ snapshot: () => lawyerSnapshot({ billingRequired: false, subscriptionStatus: "ACTIVE" }) });
    render(<BillingCenter role="lawyer" backHref="/lawyer/dashboard" locale="mn" returnTo="/legal-ai" />);
    expect(await screen.findByRole("link", { name: /Үргэлжлүүлэх/ })).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("5. a failed or cancelled payment explains itself and offers a retry without re-registering", async () => {
    billingFetch({
      snapshot: () => lawyerSnapshot({ history: [{ id: "inv-8", planCode: "SOLO", planName: "TORE Lawyer", amountMnt: 49_000, status: "CANCELLED", provider: "MANUAL", method: "QR", paymentCode: "1234", createdAt: "2026-10-01T00:00:00.000Z" }] }),
    });
    render(<BillingCenter role="lawyer" backHref="/lawyer/dashboard" locale="mn" returnTo="/legal-ai" />);
    expect(await screen.findByText(/Өмнөх төлбөр цуцлагдсан/)).toBeTruthy();
    expect(screen.getByText("Багц сонгох")).toBeTruthy();
    expect(screen.getByRole("button", { name: "QR кодоор төлөх" })).toBeTruthy();
    expect(screen.getAllByText(/49,000₮/).length).toBeGreaterThan(0);
  });

  it("7. repeated clicks on a payment method send one checkout request", async () => {
    let finish: (r: Response) => void = () => {};
    const calls = billingFetch({
      snapshot: () => lawyerSnapshot(),
      onCheckout: () => new Promise<Response>((r) => (finish = r)) as unknown as Response,
    });
    render(<BillingCenter role="lawyer" backHref="/lawyer/dashboard" locale="mn" />);
    const button = await screen.findByRole("button", { name: "QR кодоор төлөх" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    await act(async () => { finish(json({ invoiceId: "inv-1", amountMnt: 49_000, status: "PENDING", reference: "5555" })); });
    expect(calls.filter((c) => c === "POST /api/lawyer/billing/checkout")).toHaveLength(1);
  });

  it("shows the payment history section as an anchor target", async () => {
    billingFetch({ snapshot: () => lawyerSnapshot() });
    const { container } = render(<BillingCenter role="lawyer" backHref="/lawyer/dashboard" locale="mn" />);
    await screen.findByText("Багц идэвхгүй байна");
    expect(container.querySelector("#history")).not.toBeNull();
  });
});

describe("8. licence and subscription status stay independent in the workspace card", () => {
  function snapshotFetch(snapshot: unknown) {
    vi.stubGlobal("fetch", vi.fn(async () => json(snapshot)));
  }

  it("verified licence + inactive plan: asks to activate the plan, shows both facts separately", async () => {
    snapshotFetch(lawyerSnapshot());
    render(<LawyerPlanStatusCard licenseState="APPROVED" />);
    expect((await screen.findByTestId("plan-stage")).textContent).toBe("Өөрийн багц идэвхгүй");
    expect(screen.getByTestId("license-stage").textContent).toBe("Эрх баталгаажсан");
    const action = screen.getByRole("link", { name: "Багц идэвхжүүлэх" });
    expect(action.getAttribute("href")).toBe("/lawyer/billing?returnTo=%2Flegal-ai");
  });

  it("active plan + unsubmitted licence: the plan is active, the licence is still reported as missing", async () => {
    snapshotFetch(lawyerSnapshot({ billingRequired: false, subscriptionStatus: "ACTIVE", expiresAt: "2030-01-15T00:00:00.000Z" }));
    render(<LawyerPlanStatusCard licenseState="SUBMIT_LICENSE" />);
    expect((await screen.findByTestId("plan-stage")).textContent).toBe("Багц идэвхтэй");
    expect(screen.getByTestId("license-stage").textContent).toBe("Эрхийн бичиг илгээгээгүй");
    expect(screen.getByText(/Дуусах: 2030\.01\.15/)).toBeTruthy();
    expect(screen.queryByText(/AI асуулт:/)).toBeNull();
    expect(screen.getByRole("link", { name: "Эрхийн бичгээ илгээх" }).getAttribute("href")).toBe("/lawyer/verification");
  });

  it("pending payment is shown as pending, not active, and does not invent usage or expiry", async () => {
    snapshotFetch(lawyerSnapshot({ subscriptionStatus: "PENDING", pendingInvoice: { status: "PENDING" } }));
    render(<LawyerPlanStatusCard licenseState="UNDER_REVIEW" />);
    expect((await screen.findByTestId("plan-stage")).textContent).toBe("Төлбөр хүлээгдэж байна");
    expect(screen.queryByText(/Дуусах/)).toBeNull();
    expect(screen.queryByText(/AI асуулт:/)).toBeNull();
  });

  describe("neutral note about other Legal AI access (Option A wording)", () => {
    const NOTE = "Энэ нь зөвхөн таны өөрийн багцын төлөв. Legal AI-ийн хандалтын бодит төлөвийг Legal AI хуудас харуулна.";

    it("inactive: new badge wording, the neutral note, and the activation CTA is kept", async () => {
      snapshotFetch(lawyerSnapshot({ subscriptionStatus: "NONE" }));
      render(<LawyerPlanStatusCard licenseState="APPROVED" />);
      expect((await screen.findByTestId("plan-stage")).textContent).toBe("Өөрийн багц идэвхгүй");
      expect(screen.getByTestId("plan-other-access-note").textContent).toBe(NOTE);
      expect(screen.getByRole("link", { name: "Багц идэвхжүүлэх" })).toBeTruthy();
    });

    it("expired: new badge wording, the neutral note, and the renew CTA is kept", async () => {
      snapshotFetch(lawyerSnapshot({ subscriptionStatus: "EXPIRED", expiresAt: "2026-10-01T00:00:00.000Z" }));
      render(<LawyerPlanStatusCard licenseState="APPROVED" />);
      expect((await screen.findByTestId("plan-stage")).textContent).toBe("Өөрийн багцын хугацаа дууссан");
      expect(screen.getByTestId("plan-other-access-note").textContent).toBe(NOTE);
      expect(screen.getByRole("link", { name: "Багц сунгах" })).toBeTruthy();
    });

    it.each([
      ["CANCELED", { subscriptionStatus: "CANCELED" }, true],
      ["PAST_DUE", { subscriptionStatus: "PAST_DUE" }, true],
    ])("%s maps to the inactive/expired stages and shows the note", async (_label, over, expected) => {
      snapshotFetch(lawyerSnapshot(over));
      render(<LawyerPlanStatusCard licenseState="APPROVED" />);
      await screen.findByTestId("plan-stage");
      expect(Boolean(screen.queryByTestId("plan-other-access-note"))).toBe(expected);
    });

    it.each([
      ["active", lawyerSnapshot({ billingRequired: false, subscriptionStatus: "ACTIVE", expiresAt: "2030-01-15T00:00:00.000Z" })],
      ["pending payment", lawyerSnapshot({ subscriptionStatus: "PENDING", pendingInvoice: { status: "PENDING" } })],
      ["payment awaiting verification", lawyerSnapshot({ subscriptionStatus: "PENDING", pendingInvoice: { status: "AWAITING_VERIFICATION" } })],
    ])("%s: no note and no inactive/expired wording", async (_label, snapshot) => {
      snapshotFetch(snapshot);
      render(<LawyerPlanStatusCard licenseState="APPROVED" />);
      await screen.findByTestId("plan-stage");
      expect(screen.queryByTestId("plan-other-access-note")).toBeNull();
      expect(screen.queryByText(/Legal AI-д багийн суудал/)).toBeNull();
      expect(screen.queryByText("Өөрийн багц идэвхгүй")).toBeNull();
      expect(screen.queryByText("Өөрийн багцын хугацаа дууссан")).toBeNull();
    });

    it("unknown status: no note", async () => {
      snapshotFetch({ planName: "TORE Lawyer", expiresAt: null, pendingInvoice: null });
      render(<LawyerPlanStatusCard licenseState="APPROVED" />);
      await screen.findByTestId("plan-unknown");
      expect(screen.queryByTestId("plan-other-access-note")).toBeNull();
    });

    it("status unavailable (request failed): no note", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => json({}, 500)));
      render(<LawyerPlanStatusCard licenseState="APPROVED" />);
      await screen.findByText("Багцын төлөвийг ачаалж чадсангүй.");
      expect(screen.queryByTestId("plan-other-access-note")).toBeNull();
    });

    it("never claims the lawyer has, or lacks, an active entitlement", async () => {
      snapshotFetch(lawyerSnapshot({ subscriptionStatus: "NONE" }));
      render(<LawyerPlanStatusCard licenseState="APPROVED" />);
      const note = (await screen.findByTestId("plan-other-access-note")).textContent ?? "";
      // Scoped to what this card is (the lawyer's own plan); no claim that another access source exists or is active.
      expect(note).toMatch(/зөвхөн таны өөрийн багцын төлөв/);
      expect(note).not.toMatch(/идэвхтэй|баталгаажсан|танд .*эрх.*байна|хандах эрхтэй/);
      expect(note).not.toMatch(/эрхгүй|хандах боломжгүй/);
      // Team seats do not exist as a product flow today: the note must not suggest them.
      expect(note).not.toMatch(/суудал|багийн|өөр эрх|боломжтой/);
      // It points to the page that reports the real state.
      expect(note).toMatch(/Legal AI хуудас харуулна/);
    });
  });

  it("reads the read-only status endpoint, never the session-touching billing snapshot", async () => {
    const fetchMock = vi.fn(async () => json(lawyerSnapshot()));
    vi.stubGlobal("fetch", fetchMock);
    render(<LawyerPlanStatusCard licenseState="APPROVED" />);
    await screen.findByTestId("plan-stage");
    const urls = fetchMock.mock.calls.map((call) => String((call as unknown[])[0]));
    expect(urls).toEqual(["/api/lawyer/billing/status"]);
  });

  describe("non-attorney positions (no licence flow: licenseState = null)", () => {
    it("inactive plan: still asks to activate the plan, with no licence line and no verification action", async () => {
      snapshotFetch(lawyerSnapshot());
      render(<LawyerPlanStatusCard licenseState={null} />);
      expect((await screen.findByTestId("plan-stage")).textContent).toBe("Өөрийн багц идэвхгүй");
      expect(screen.queryByTestId("license-stage")).toBeNull();
      expect(screen.getByRole("link", { name: "Багц идэвхжүүлэх" }).getAttribute("href")).toBe("/lawyer/billing?returnTo=%2Flegal-ai");
      expect(document.querySelector('a[href="/lawyer/verification"]')).toBeNull();
    });

    it("active subscription: plan and expiry stay visible, no licence status or action is shown", async () => {
      snapshotFetch(lawyerSnapshot({ billingRequired: false, subscriptionStatus: "ACTIVE", expiresAt: "2030-01-15T00:00:00.000Z" }));
      render(<LawyerPlanStatusCard licenseState={null} />);
      expect((await screen.findByTestId("plan-stage")).textContent).toBe("Багц идэвхтэй");
      expect(screen.getByText(/Дуусах: 2030\.01\.15/)).toBeTruthy();
      expect(screen.queryByTestId("license-stage")).toBeNull();
      expect(screen.queryByRole("link", { name: /Эрхийн/ })).toBeNull();
      expect(document.querySelector('a[href="/lawyer/verification"]')).toBeNull();
      expect(screen.getByRole("link", { name: "Багц удирдах" })).toBeTruthy();
    });

    it("an attorney with the same active plan still gets the licence line and action", async () => {
      snapshotFetch(lawyerSnapshot({ billingRequired: false, subscriptionStatus: "ACTIVE", expiresAt: "2030-01-15T00:00:00.000Z" }));
      render(<LawyerPlanStatusCard licenseState="SUBMIT_LICENSE" />);
      await screen.findByTestId("plan-stage");
      expect(screen.getByTestId("license-stage")).toBeTruthy();
      expect(document.querySelector('a[href="/lawyer/verification"]')).not.toBeNull();
    });
  });

  describe("missing or invalid subscriptionStatus is unknown, never inactive", () => {
    it.each([
      ["absent", {}],
      ["null", { subscriptionStatus: null }],
      ["an unrecognised value", { subscriptionStatus: "WEIRD" }],
      ["a non-string", { subscriptionStatus: 7 }],
    ])("%s", async (_label, status) => {
      snapshotFetch({ planName: "TORE Lawyer", expiresAt: null, pendingInvoice: null, ...status });
      render(<LawyerPlanStatusCard licenseState="APPROVED" />);
      expect((await screen.findByTestId("plan-unknown")).textContent).toBe("Багцын төлөв тодорхойгүй байна.");
      expect(screen.queryByTestId("plan-stage")).toBeNull();
      expect(screen.queryByText("Багц идэвхгүй")).toBeNull();
      expect(screen.queryByText("Өөрийн багц идэвхгүй")).toBeNull();
      expect(screen.queryByTestId("plan-other-access-note")).toBeNull();
      expect(screen.queryByRole("link", { name: "Багц идэвхжүүлэх" })).toBeNull();
      // The licence fact is independent and still shown; the plan link is neutral.
      expect(screen.getByTestId("license-stage").textContent).toBe("Эрх баталгаажсан");
      expect(screen.getByRole("link", { name: "Багц ба төлбөр нээх" })).toBeTruthy();
    });

    it("a valid NONE status is still shown as inactive (existing behaviour preserved)", async () => {
      snapshotFetch(lawyerSnapshot({ subscriptionStatus: "NONE" }));
      render(<LawyerPlanStatusCard licenseState="APPROVED" />);
      expect((await screen.findByTestId("plan-stage")).textContent).toBe("Өөрийн багц идэвхгүй");
      expect(screen.queryByTestId("plan-unknown")).toBeNull();
    });
  });

  it("does not make up a status when the snapshot cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 500)));
    render(<LawyerPlanStatusCard licenseState="APPROVED" />);
    expect(await screen.findByText("Багцын төлөвийг ачаалж чадсангүй.")).toBeTruthy();
    expect(screen.queryByTestId("plan-stage")).toBeNull();
  });
});

describe("9. workspace billing navigation at desktop and mobile layouts", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => json(lawyerSnapshot())));
  });
  const user = { name: "Б. Хуульч", email: "l@example.mn" };
  const frame = (variant: "page" | "workbench") => (
    <LawyerWorkspaceFrame variant={variant} user={user} profileHref="/lawyer/profile" locale="mn" languageLabel="Хэл" signOutLabel="Гарах" licenseState="APPROVED">
      <div>content</div>
    </LawyerWorkspaceFrame>
  );

  it.each(["page", "workbench"] as const)("%s: the desktop sidebar links to Миний багц and Төлбөрийн түүх and shows the plan card", async (variant) => {
    render(frame(variant));
    const plan = screen.getAllByRole("link", { name: "Миний багц" }).find((a) => a.getAttribute("href") === "/lawyer/billing");
    const history = screen.getAllByRole("link", { name: "Төлбөрийн түүх" }).find((a) => a.getAttribute("href") === "/lawyer/billing#history");
    expect(plan).toBeTruthy();
    expect(history).toBeTruthy();
    expect(await screen.findByTestId("plan-stage")).toBeTruthy();
  });

  it.each(["page", "workbench"] as const)("%s: a non-attorney (licenseState null) still gets the plan card, without a licence line", async (variant) => {
    render(
      <LawyerWorkspaceFrame variant={variant} user={user} profileHref="/lawyer/profile" locale="mn" languageLabel="Хэл" signOutLabel="Гарах" licenseState={null}>
        <div>content</div>
      </LawyerWorkspaceFrame>,
    );
    expect(await screen.findByTestId("plan-stage")).toBeTruthy();
    expect(screen.queryByTestId("license-stage")).toBeNull();
  });

  it.each(["page", "workbench"] as const)("%s: without licenseState (undefined) the plan card is not rendered", async (variant) => {
    render(
      <LawyerWorkspaceFrame variant={variant} user={user} profileHref="/lawyer/profile" locale="mn" languageLabel="Хэл" signOutLabel="Гарах">
        <div>content</div>
      </LawyerWorkspaceFrame>,
    );
    await screen.findByText("content");
    expect(screen.queryByTestId("plan-status-card")).toBeNull();
  });

  it.each(["page", "workbench"] as const)("%s: the mobile drawer exposes the same billing links and plan card after opening the menu", async (variant) => {
    render(frame(variant));
    fireEvent.click(screen.getAllByRole("button", { name: "Цэс нээх" })[0]!);
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByRole("link", { name: "Миний багц" }).getAttribute("href")).toBe("/lawyer/billing");
    expect(within(drawer).getByRole("link", { name: "Төлбөрийн түүх" }).getAttribute("href")).toBe("/lawyer/billing#history");
    await waitFor(() => expect(within(drawer).getByTestId("plan-stage")).toBeTruthy());
  });
});
