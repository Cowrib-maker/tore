// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
  usePathname: () => "/admin/preview/checkout/citizen",
  useSearchParams: () => new URLSearchParams(),
}));

import { BillingSandbox } from "@/components/admin/preview/billing-sandbox";
import { BillingCenter } from "@/components/billing/billing-center";
import {
  BILLING_PREVIEW_SCENARIO_IDS,
  SIMULATED_ID_PREFIX,
  createSimulatedBilling,
  type BillingPreviewScenarioId,
} from "@/domain/admin-preview/billing-simulation";
import { CITIZEN_PLANS, SOLO_PLAN, getPlanDefinition } from "@/domain/constants/subscription-plans";

const NOW = "2026-10-10T00:00:00.000Z";
const fetchSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  fetchSpy.mockRejectedValue(new Error("network must not be used"));
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function sandbox(role: "citizen" | "lawyer", scenario: BillingPreviewScenarioId) {
  return render(<BillingSandbox role={role} scenario={scenario} nowIso={NOW} locale="mn" />);
}

describe("admin checkout preview — every product/role × payment state renders the real BillingCenter", () => {
  const combos = (["citizen", "lawyer"] as const).flatMap((role) => BILLING_PREVIEW_SCENARIO_IDS.map((scenario) => [role, scenario] as const));

  it.each(combos)("%s / %s renders, is labelled TEST / SIMULATED, and never uses the network", async (role, scenario) => {
    sandbox(role, scenario);
    expect(await screen.findByText("Миний багц")).toBeTruthy();
    expect(screen.getAllByText(/TEST \/ SIMULATED/).length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows the catalog price and quotas on the plan-selection screen (single source: subscription-plans.ts)", async () => {
    sandbox("citizen", "no-plan");
    await screen.findByText("Багц сонгох");
    for (const code of CITIZEN_PLANS) {
      const plan = getPlanDefinition(code);
      expect(screen.getByText(plan.name)).toBeTruthy();
      expect(screen.getAllByText((_, el) => el?.textContent?.startsWith(`${plan.priceMnt.toLocaleString("mn-MN")}₮`) ?? false).length).toBeGreaterThan(0);
      expect(screen.getAllByText(new RegExp(`${plan.quotas.legalAiQueries} AI асуулт`)).length).toBeGreaterThan(0);
    }
  });

  it("lawyer plan screen shows the SOLO catalog price", async () => {
    sandbox("lawyer", "no-plan");
    await screen.findByText(SOLO_PLAN.name);
    expect(screen.getAllByText((_, el) => el?.textContent?.startsWith(`${SOLO_PLAN.priceMnt.toLocaleString("mn-MN")}₮`) ?? false).length).toBeGreaterThan(0);
  });

  it("walks the whole citizen flow: choose plan → method → invoice → 'I paid' → admin confirms → active (all simulated)", async () => {
    sandbox("citizen", "no-plan");
    fireEvent.click(await screen.findByText("QR кодоор төлөх"));
    expect(await screen.findByText("Төлбөр хүлээгдэж байна")).toBeTruthy();
    expect(screen.getByAltText("Төлбөрийн QR").getAttribute("src")).toContain("SIMULATED");
    expect(document.body.textContent).toContain(SIMULATED_ID_PREFIX);
    fireEvent.click(screen.getByText("Төлбөр хийсэн"));
    expect(await screen.findByText("Төлбөр шалгагдаж байна")).toBeTruthy();
    fireEvent.click(screen.getByText("Төлбөр амжилттай болгох (симуляци)"));
    await waitFor(() => expect(screen.getByText("Идэвхтэй")).toBeTruthy());
    expect(screen.getAllByText("Баталгаажсан").length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["fail", "Төлбөр баталгаажаагүй. Дахин оролдоно уу."],
    ["expire", "Нэхэмжлэлийн хугацаа дууссан. Шинэ нэхэмжлэл үүсгэнэ үү."],
    ["cancel", "Нэхэмжлэл цуцлагдсан. Шинэ нэхэмжлэл үүсгэнэ үү."],
  ] as const)("simulated %s event shows the matching failure screen", async (event, text) => {
    sandbox("lawyer", "pending-payment");
    await screen.findByText("Төлбөр хүлээгдэж байна");
    const label = { fail: "Амжилтгүй болгох", expire: "Хугацаа дуусгах", cancel: "Цуцлах" }[event];
    fireEvent.click(screen.getByText(label));
    expect(await screen.findByText(text)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("static states render: failed, expired, cancelled, subscription-expired, active", async () => {
    for (const [scenario, text] of [
      ["payment-failed", "Төлбөр баталгаажаагүй. Дахин оролдоно уу."],
      ["invoice-expired", "Нэхэмжлэлийн хугацаа дууссан. Шинэ нэхэмжлэл үүсгэнэ үү."],
      ["invoice-cancelled", "Нэхэмжлэл цуцлагдсан. Шинэ нэхэмжлэл үүсгэнэ үү."],
    ] as const) {
      const view = sandbox("citizen", scenario);
      expect(await screen.findByText(text)).toBeTruthy();
      view.unmount();
    }
    const expired = sandbox("lawyer", "subscription-expired");
    expect(await screen.findByText("Багц идэвхгүй байна")).toBeTruthy();
    expired.unmount();
    sandbox("lawyer", "active");
    expect(await screen.findByText("Идэвхтэй")).toBeTruthy();
  });
});

describe("the real (non-preview) BillingCenter is unchanged by the transport seam", () => {
  it("without a transport it still talks to the real billing API and shows no simulation label", async () => {
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ audience: "citizen", planName: null, statusLabel: "NONE", remainingLegalQuestions: 0, currentPeriodEnd: null, billingRequired: true, availablePlans: [], pendingInvoice: null, history: [] }),
        { status: 200 },
      ),
    );
    render(<BillingCenter role="citizen" backHref="/client/dashboard" locale="mn" />);
    await screen.findByText("Миний багц");
    expect(fetchSpy).toHaveBeenCalledWith("/api/citizen/billing", { credentials: "same-origin" });
    expect(screen.queryByText(/TEST \/ SIMULATED/)).toBeNull();
  });
});

describe("simulation engine: pure and self-contained", () => {
  it("counts only its own calls and keeps every id in the SIM- namespace", async () => {
    const sim = createSimulatedBilling("citizen", "no-plan", NOW);
    const result = await sim.transport.checkout({ planCode: "CITIZEN_PLUS", method: "BANK_TRANSFER" });
    expect(result.ok).toBe(true);
    expect(result.view.invoiceId?.startsWith(SIMULATED_ID_PREFIX)).toBe(true);
    expect(result.view.amountMnt).toBe(getPlanDefinition(CITIZEN_PLANS[1]).priceMnt);
    expect(sim.calls.checkout).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a plan code that is not a citizen plan (clients cannot invent plans)", async () => {
    const sim = createSimulatedBilling("citizen", "no-plan", NOW);
    expect((await sim.transport.checkout({ planCode: "SOLO" as never, method: "QR" })).ok).toBe(false);
    expect((await sim.transport.checkout({ planCode: null, method: "QR" })).ok).toBe(false);
  });
});

describe("an injected transport can never render unlabelled", () => {
  it("shows TEST / SIMULATED even when the caller forgets the `simulated` flag", async () => {
    const sim = createSimulatedBilling("lawyer", "no-plan", NOW);
    render(<BillingCenter role="lawyer" backHref="/admin/preview" locale="mn" transport={sim.transport} />);
    await screen.findByText("Миний багц");
    expect(screen.getAllByText(/TEST \/ SIMULATED/).length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("a closed invoice never strands the customer", () => {
  it.each([
    ["payment-failed"],
    ["invoice-expired"],
    ["invoice-cancelled"],
  ] as const)("%s offers a restart that returns to plan selection and can create a new simulated invoice", async (scenario) => {
    sandbox("citizen", scenario);
    fireEvent.click(await screen.findByText("Шинээр эхлэх"));
    expect(await screen.findByText("Багц сонгох")).toBeTruthy();
    fireEvent.click(screen.getByText("QR кодоор төлөх"));
    expect(await screen.findByText("Төлбөр хүлээгдэж байна")).toBeTruthy();
    expect(document.body.textContent).toMatch(/SIM-000[2-9]/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("an open invoice does not show the restart button", async () => {
    sandbox("lawyer", "pending-payment");
    await screen.findByText("Төлбөр хүлээгдэж байна");
    expect(screen.queryByText("Шинээр эхлэх")).toBeNull();
  });
});
