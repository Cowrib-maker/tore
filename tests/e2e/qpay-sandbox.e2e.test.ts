import { afterAll, describe, expect, it } from "vitest";

import { InvoiceStatus, SubscriptionStatus } from "@/domain/enums";
import { SOLO_PLAN } from "@/domain/constants/subscription-plans";
import { addUtcCalendarMonth } from "@/domain/services/subscription-period";
import {
  assertNoQpaySecretsInPayload,
  ensureE2eLawyer,
  expectedSoloExpiry,
  fetchJson,
  loginLawyer,
  printSandboxPayInstructions,
  prisma,
  readSandboxE2eConfig,
  waitForSandboxPayment,
  type CheckoutView,
} from "./qpay-sandbox-helpers";

/**
 * Real QPay Merchant V2 Sandbox E2E.
 * Not part of `npm run test`. Run: npm run test:qpay-sandbox
 *
 * Requires a running Next.js app (`npm run dev`) and Sandbox env vars.
 * Payment is manual in QPay Sandbox; this file never mocks QPay HTTP.
 */
describe("QPay Sandbox E2E", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });
  it("activates SOLO only after a verified Sandbox payment", async () => {
    const config = readSandboxE2eConfig();
    const lawyer = await ensureE2eLawyer();
    const jar = await loginLawyer(config.baseUrl, lawyer.email, lawyer.password);

    const beforeAi = await fetchJson(config.baseUrl, jar, "/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "ping", mode: "PROFESSIONAL" }),
    });
    expect(beforeAi.status).toBe(402);
    expect(JSON.stringify(beforeAi.json)).not.toContain(
      process.env.QPAY_CLIENT_SECRET ?? "never",
    );

    const billingBefore = await fetchJson(
      config.baseUrl,
      jar,
      "/api/lawyer/billing",
    );
    expect(billingBefore.status).toBe(200);
    const billingBeforeBody = billingBefore.json as {
      billingRequired?: boolean;
      subscriptionStatus?: string;
    };
    expect(billingBeforeBody.billingRequired).toBe(true);
    expect(billingBeforeBody.subscriptionStatus).not.toBe("ACTIVE");
    assertNoQpaySecretsInPayload(billingBefore.json);

    const checkoutRes = await fetchJson(
      config.baseUrl,
      jar,
      "/api/lawyer/billing/checkout",
      { method: "POST" },
    );
    expect(checkoutRes.status).toBe(200);
    const checkout = checkoutRes.json as CheckoutView;
    expect(checkout.planCode).toBe("SOLO");
    expect(checkout.amountMnt).toBe(SOLO_PLAN.priceMnt);
    expect(checkout.currency).toBe("MNT");
    expect(checkout.status).toBe(InvoiceStatus.PENDING);
    expect(checkout.invoiceId).toBeTruthy();
    expect(
      Boolean(checkout.qrText) ||
        Boolean(checkout.shortUrl) ||
        checkout.deeplinks.length > 0,
    ).toBe(true);
    assertNoQpaySecretsInPayload(checkout);
    expect(checkout).not.toHaveProperty("clientId");
    expect(checkout).not.toHaveProperty("clientSecret");

    const localInvoice = await prisma.invoice.findUnique({
      where: { id: checkout.invoiceId },
    });
    expect(localInvoice).not.toBeNull();
    expect(localInvoice?.userId).toBe(lawyer.id);
    expect(localInvoice?.status).toBe(InvoiceStatus.PENDING);
    expect(localInvoice?.amountMnt).toBe(49_000);
    expect(localInvoice?.providerInvoiceId).toBeTruthy();
    const providerInvoiceId = localInvoice!.providerInvoiceId!;
    console.log(`QPay providerInvoiceId: ${providerInvoiceId}`);
    printSandboxPayInstructions(checkout, providerInvoiceId);

    const unpaidCallback = await fetchJson(
      config.baseUrl,
      null,
      "/api/billing/qpay/callback",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: providerInvoiceId }),
      },
    );
    expect(unpaidCallback.status).toBe(200);
    const unpaidBody = unpaidCallback.json as { ok?: boolean; code?: string };
    expect(unpaidBody.ok).toBe(false);
    expect(unpaidBody.code).toBe("PAYMENT_NOT_SUCCESSFUL");

    const stillPending = await prisma.invoice.findUnique({
      where: { id: checkout.invoiceId },
    });
    expect(stillPending?.status).toBe(InvoiceStatus.PENDING);
    expect(
      await prisma.paymentTransaction.findUnique({
        where: { invoiceId: checkout.invoiceId },
      }),
    ).toBeNull();
    expect(
      await prisma.subscription.findFirst({
        where: {
          ownerUserId: lawyer.id,
          status: SubscriptionStatus.ACTIVE,
          planCode: "SOLO",
        },
      }),
    ).toBeNull();

    const sandbox = await waitForSandboxPayment(
      providerInvoiceId,
      config.paymentWaitMs,
      config.pollMs,
    );
    if (!sandbox.paid) {
      throw new Error(
        `QPay Sandbox payment/check did not confirm PAID within ${config.paymentWaitMs}ms. ` +
          `Invoice remains unpaid; subscription was not activated. Last check: ${JSON.stringify(sandbox.check)}`,
      );
    }

    const callback = await fetchJson(
      config.baseUrl,
      null,
      "/api/billing/qpay/callback",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: providerInvoiceId }),
      },
    );
    expect(callback.status).toBe(200);
    const callbackBody = callback.json as {
      ok?: boolean;
      alreadyProcessed?: boolean;
    };
    expect(callbackBody.ok).toBe(true);

    const paidInvoice = await prisma.invoice.findUnique({
      where: { id: checkout.invoiceId },
    });
    expect(paidInvoice?.status).toBe(InvoiceStatus.PAID);
    expect(paidInvoice?.providerInvoiceId).toBe(providerInvoiceId);

    const payment = await prisma.paymentTransaction.findUnique({
      where: { invoiceId: checkout.invoiceId },
    });
    expect(payment).not.toBeNull();
    expect(payment?.status).toBe("PAID");
    expect(payment?.amountMnt).toBe(49_000);
    expect(payment?.providerPaymentId).toBeTruthy();

    const subscription = await prisma.subscription.findFirst({
      where: {
        ownerUserId: lawyer.id,
        planCode: "SOLO",
        status: SubscriptionStatus.ACTIVE,
      },
    });
    expect(subscription).not.toBeNull();
    expect(subscription?.seatLimit).toBe(1);
    expect(subscription?.currentPeriodEnd.getTime()).toBe(
      expectedSoloExpiry(subscription!.currentPeriodStart).getTime(),
    );
    const now = Date.now();
    expect(subscription!.currentPeriodStart.getTime()).toBeLessThanOrEqual(now);
    expect(subscription!.currentPeriodEnd.getTime()).toBeGreaterThan(now);
    expect(
      Math.abs(
        subscription!.currentPeriodEnd.getTime() -
          addUtcCalendarMonth(subscription!.currentPeriodStart).getTime(),
      ),
    ).toBe(0);

    const duplicate = await fetchJson(
      config.baseUrl,
      null,
      "/api/billing/qpay/callback",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: providerInvoiceId }),
      },
    );
    expect(duplicate.status).toBe(200);
    expect((duplicate.json as { alreadyProcessed?: boolean }).alreadyProcessed).toBe(
      true,
    );
    expect(
      await prisma.paymentTransaction.count({
        where: { invoiceId: checkout.invoiceId },
      }),
    ).toBe(1);
    expect(
      await prisma.subscription.count({
        where: {
          ownerUserId: lawyer.id,
          planCode: "SOLO",
          status: SubscriptionStatus.ACTIVE,
        },
      }),
    ).toBe(1);

    const statusRes = await fetchJson(
      config.baseUrl,
      jar,
      `/api/lawyer/billing/invoices/${checkout.invoiceId}`,
    );
    expect(statusRes.status).toBe(200);
    const statusBody = statusRes.json as {
      paid?: boolean;
      invoiceStatus?: string;
      subscriptionStatus?: string;
    };
    expect(statusBody.invoiceStatus).toBe(InvoiceStatus.PAID);
    expect(statusBody.subscriptionStatus).toBe("ACTIVE");
    expect(statusBody.paid).toBe(true);
    assertNoQpaySecretsInPayload(statusRes.json);

    const billingAfter = await fetchJson(
      config.baseUrl,
      jar,
      "/api/lawyer/billing",
    );
    expect(billingAfter.status).toBe(200);
    const billingAfterBody = billingAfter.json as {
      billingRequired?: boolean;
      subscriptionStatus?: string;
    };
    expect(billingAfterBody.billingRequired).toBe(false);
    expect(billingAfterBody.subscriptionStatus).toBe("ACTIVE");

    const afterAi = await fetchJson(config.baseUrl, jar, "/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "ping", mode: "PROFESSIONAL" }),
    });
    expect(afterAi.status).not.toBe(402);
    expect(afterAi.status).not.toBe(401);
    expect(afterAi.status).not.toBe(403);
  }, 10 * 60 * 1000);
});
