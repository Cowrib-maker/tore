import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/application/common/actor-context";
import { claimManualPayment } from "@/application/use-cases/billing/claim-manual-payment";
import { verifyManualPayment } from "@/application/use-cases/billing/verify-manual-payment";
import { createCitizenPlanCheckout } from "@/application/use-cases/billing/create-plan-checkout";
import {
  BILLING_PROVIDER_MANUAL_BANK_TRANSFER,
  BILLING_PROVIDER_QPAY,
  InvoiceStatus,
  SubscriptionPlanCode,
  SubscriptionStatus,
  UserRole,
} from "@/domain/enums";
import { ValidationError } from "@/domain/errors/domain-error";
import { InMemoryBillingUnitOfWork } from "@/infrastructure/database/in-memory-billing-unit-of-work";
import { InMemoryInvoiceRepository } from "@/infrastructure/repositories/in-memory-invoice-repository";
import { InMemorySubscriptionRepository } from "@/infrastructure/repositories/in-memory-subscription-repository";

const client: ActorContext = { userId: "client-1", role: UserRole.CLIENT };
const admin: ActorContext = { userId: "admin-1", role: UserRole.ADMIN };
const now = new Date("2026-08-22T12:00:00.000Z");

describe("plan price is server-authoritative (QPay checkout path)", () => {
  function buildDeps(invoices: InMemoryInvoiceRepository) {
    return {
      invoiceRepository: invoices,
      qpayGateway: {
        createInvoice: vi.fn().mockResolvedValue({
          providerInvoiceId: "qpay-inv-1",
          qrText: "qr",
          qrImage: "img",
          shortUrl: null,
          urls: [],
        }),
        checkPayment: vi.fn(),
      },
      qpayCallbackUrl: "https://tore.mn/api/billing/qpay/callback",
    };
  }

  it("F: a QPay checkout invoice never has a paymentCode — the field stays null", async () => {
    const invoices = new InMemoryInvoiceRepository();
    const view = await createCitizenPlanCheckout(
      client,
      SubscriptionPlanCode.CITIZEN_BASIC,
      buildDeps(invoices),
      now,
    );
    const stored = await invoices.findById(view.invoiceId!);
    expect(stored?.provider).toBe(BILLING_PROVIDER_QPAY);
    expect(stored?.paymentCode).toBeNull();
  });

  it("N/O: CITIZEN_BASIC and CITIZEN_PLUS always use their fixed catalog price — there is no input through which a client supplies an amount", async () => {
    const invoicesBasic = new InMemoryInvoiceRepository();
    const basic = await createCitizenPlanCheckout(
      client,
      SubscriptionPlanCode.CITIZEN_BASIC,
      buildDeps(invoicesBasic),
      now,
    );
    expect((await invoicesBasic.findById(basic.invoiceId!))?.amountMnt).toBe(19_900);

    const invoicesPlus = new InMemoryInvoiceRepository();
    const plus = await createCitizenPlanCheckout(
      client,
      SubscriptionPlanCode.CITIZEN_PLUS,
      buildDeps(invoicesPlus),
      now,
    );
    expect((await invoicesPlus.findById(plus.invoiceId!))?.amountMnt).toBe(49_900);
  });

  it("rejects any plan code outside the known citizen catalog rather than pricing it as zero/arbitrary", async () => {
    const invoices = new InMemoryInvoiceRepository();
    await expect(
      createCitizenPlanCheckout(
        client,
        // Simulates a client sending an unexpected string — the use-case
        // signature accepts `string`, so this must be validated at runtime.
        "CITIZEN_ULTRA_DELUXE",
        buildDeps(invoices),
        now,
      ),
    ).rejects.toThrow(ValidationError);
  });
});

describe("K: an invoice with a null paymentCode (pre-existing before this feature) still works end-to-end", () => {
  it("claim + admin verify succeed normally when paymentCode was never set", async () => {
    const invoices = new InMemoryInvoiceRepository();
    const subscriptions = new InMemorySubscriptionRepository();
    const payments = new (
      await import("@/infrastructure/repositories/in-memory-invoice-repository")
    ).InMemoryPaymentTransactionRepository();
    const billingUnitOfWork = new InMemoryBillingUnitOfWork({
      invoiceRepository: invoices,
      paymentTransactionRepository: payments,
      subscriptionRepository: subscriptions,
    });

    // Deliberately omit paymentCode, simulating a row from before this
    // feature shipped. providerInvoiceId is still attached, exactly as
    // the real manual-checkout flow always does independently of
    // paymentCode.
    const created = await invoices.create({
      userId: client.userId,
      planCode: SubscriptionPlanCode.CITIZEN_BASIC,
      amountMnt: 19_900,
      currency: "MNT",
      provider: BILLING_PROVIDER_MANUAL_BANK_TRANSFER,
      status: InvoiceStatus.PENDING,
      expiresAt: new Date(now.getTime() + 60_000),
    });
    const invoice = await invoices.attachProviderInvoice(created.id, {
      providerInvoiceId: "TORE-LEGACY1",
      qrText: null,
      qrImage: null,
      shortUrl: null,
      deeplinks: [],
    });
    expect(invoice.paymentCode).toBeNull();

    const claimed = await claimManualPayment(client, invoice.id, { invoiceRepository: invoices }, now);
    expect(claimed.status).toBe(InvoiceStatus.AWAITING_VERIFICATION);

    const result = await verifyManualPayment(admin, invoice.id, { billingUnitOfWork }, now);
    expect(result.invoice.status).toBe(InvoiceStatus.PAID);
    expect(result.subscription?.status).toBe(SubscriptionStatus.ACTIVE);
  });
});
