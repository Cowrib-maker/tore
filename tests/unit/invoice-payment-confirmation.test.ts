import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isLawyerInvoicePaid } from "@/components/legal-ai/legal-ai-checkout";
import { isInvoicePaymentConfirmed } from "@/domain/services/invoice-payment-confirmation";

describe("isInvoicePaymentConfirmed (the single client-side payment rule)", () => {
  it("is true only for the server's explicit paid:true", () => {
    expect(isInvoicePaymentConfirmed({ paid: true })).toBe(true);
    expect(isInvoicePaymentConfirmed({ paid: true, invoiceStatus: "PAID", subscriptionStatus: "ACTIVE" })).toBe(true);
  });

  it.each([
    ["paid:false with an ACTIVE account subscription", { paid: false, subscriptionStatus: "ACTIVE" }],
    ["no paid field with an ACTIVE account subscription", { subscriptionStatus: "ACTIVE" }],
    ["invoiceStatus PAID alone (access not yet confirmed)", { invoiceStatus: "PAID" }],
    ["a pending invoice", { paid: false, invoiceStatus: "PENDING", subscriptionStatus: "PENDING" }],
    ["awaiting verification", { paid: false, invoiceStatus: "AWAITING_VERIFICATION" }],
    ["paid as a truthy string", { paid: "true" }],
    ["paid as 1", { paid: 1 }],
    ["an empty payload", {}],
    ["null", null],
    ["undefined", undefined],
  ])("is false for %s", (_label, payload) => {
    expect(isInvoicePaymentConfirmed(payload as never)).toBe(false);
  });

  it("the legacy isLawyerInvoicePaid is only an alias of the same rule", () => {
    for (const payload of [{ paid: true }, { paid: false, subscriptionStatus: "ACTIVE" }, { subscriptionStatus: "ACTIVE" }, {}]) {
      expect(isLawyerInvoicePaid(payload)).toBe(isInvoicePaymentConfirmed(payload));
    }
  });
});

describe("no second payment rule exists in the UI", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
  }

  it("no component decides 'paid' from subscriptionStatus === ACTIVE", () => {
    const offenders = walk(path.join(process.cwd(), "src/components"))
      .filter((file) => /subscriptionStatus\s*===\s*["']ACTIVE["']/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(process.cwd(), file));
    expect(offenders).toEqual([]);
  });

  it("the invoice pollers use the shared rule", () => {
    for (const file of [
      "src/components/billing/billing-center.tsx",
      "src/components/legal-ai/legal-ai-access-gate.tsx",
      "src/components/marketplace/consultation-payment-card.tsx",
      "src/components/account/billing-and-sessions-panel.tsx",
    ]) {
      expect(readFileSync(path.join(process.cwd(), file), "utf8"), file).toContain("isInvoicePaymentConfirmed");
    }
  });
});
