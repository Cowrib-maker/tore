import { afterAll, describe, expect, it } from "vitest";

import { InvoiceStatus, SubscriptionStatus } from "@/domain/enums";
import {
  SANDBOX_PLAN_EXPECTATIONS,
  assertNoQpaySecretsInPayload,
  ensureE2eCitizen,
  ensureE2eLawyer,
  expectedPeriodEnd,
  fetchJson,
  loginUser,
  printSandboxPayInstructions,
  prisma,
  readSandboxE2eConfig,
  waitForSandboxPayment,
  type CheckoutView,
  type SandboxE2eConfig,
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
    const jar = await loginUser(config.baseUrl, lawyer.email, lawyer.password);
    const expected = SANDBOX_PLAN_EXPECTATIONS.SOLO;

    const beforeAi = await fetchJson(config.baseUrl, jar, "/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "ping", mode: "PROFESSIONAL" }),
    });
    expect(beforeAi.status).toBe(402);
    assertNoQpaySecretsInPayload(beforeAi.json);

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
    expect(checkout.planCode).toBe(expected.planCode);
    expect(checkout.amountMnt).toBe(expected.amountMnt);
    expect(checkout.amountMnt).toBe(49_000);
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

    await expectUnpaidCallbackDoesNotActivate({
      baseUrl: config.baseUrl,
      invoiceId: checkout.invoiceId,
      providerInvoiceId,
      ownerUserId: lawyer.id,
      planCode: expected.planCode,
    });

    await waitUntilSandboxPaid(providerInvoiceId, config);

    const callback = await postQpayCallback(config.baseUrl, providerInvoiceId);
    expect(callback.status).toBe(200);
    const callbackBody = callback.json as {
      ok?: boolean;
      alreadyProcessed?: boolean;
    };
    expect(callbackBody.ok).toBe(true);
    expect(callbackBody.alreadyProcessed).toBe(false);

    await expectPaidInvoiceAndActiveSubscription({
      invoiceId: checkout.invoiceId,
      ownerUserId: lawyer.id,
      planCode: expected.planCode,
      amountMnt: expected.amountMnt,
      providerInvoiceId,
    });

    const duplicate = await postQpayCallback(config.baseUrl, providerInvoiceId);
    expect(duplicate.status).toBe(200);
    expect(
      (duplicate.json as { alreadyProcessed?: boolean }).alreadyProcessed,
    ).toBe(true);
    expect(
      await prisma.paymentTransaction.count({
        where: { invoiceId: checkout.invoiceId },
      }),
    ).toBe(1);
    expect(
      await prisma.subscription.count({
        where: {
          ownerUserId: lawyer.id,
          planCode: expected.planCode,
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

  it("activates CITIZEN_BASIC at 19,900 MNT and grants 20 legal AI queries", async () => {
    await runCitizenPaidPlan("basic");
  }, 10 * 60 * 1000);

  it("activates CITIZEN_PLUS at 49,900 MNT and grants 80 legal AI queries", async () => {
    await runCitizenPaidPlan("plus");
  }, 10 * 60 * 1000);
});

async function runCitizenPaidPlan(tag: "basic" | "plus"): Promise<void> {
  const config = readSandboxE2eConfig();
  const expected =
    tag === "basic"
      ? SANDBOX_PLAN_EXPECTATIONS.CITIZEN_BASIC
      : SANDBOX_PLAN_EXPECTATIONS.CITIZEN_PLUS;
  expect(expected.amountMnt).toBe(tag === "basic" ? 19_900 : 49_900);
  expect(expected.legalAiQueries).toBe(tag === "basic" ? 20 : 80);

  const citizen = await ensureE2eCitizen(tag);
  const jar = await loginUser(config.baseUrl, citizen.email, citizen.password);

  const checkoutRes = await fetchJson(
    config.baseUrl,
    jar,
    "/api/citizen/billing/checkout",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planCode: expected.planCode }),
    },
  );
  expect(checkoutRes.status).toBe(200);
  const checkout = checkoutRes.json as CheckoutView;
  expect(checkout.planCode).toBe(expected.planCode);
  expect(checkout.amountMnt).toBe(expected.amountMnt);
  expect(checkout.currency).toBe("MNT");
  expect(checkout.status).toBe(InvoiceStatus.PENDING);
  assertNoQpaySecretsInPayload(checkout);

  const localInvoice = await prisma.invoice.findUnique({
    where: { id: checkout.invoiceId },
  });
  expect(localInvoice?.userId).toBe(citizen.id);
  expect(localInvoice?.planCode).toBe(expected.planCode);
  expect(localInvoice?.amountMnt).toBe(expected.amountMnt);
  expect(localInvoice?.providerInvoiceId).toBeTruthy();
  const providerInvoiceId = localInvoice!.providerInvoiceId!;
  printSandboxPayInstructions(checkout, providerInvoiceId);

  await expectUnpaidCallbackDoesNotActivate({
    baseUrl: config.baseUrl,
    invoiceId: checkout.invoiceId,
    providerInvoiceId,
    ownerUserId: citizen.id,
    planCode: expected.planCode,
  });

  await waitUntilSandboxPaid(providerInvoiceId, config);

  const callback = await postQpayCallback(config.baseUrl, providerInvoiceId);
  expect(callback.status).toBe(200);
  const callbackBody = callback.json as {
    ok?: boolean;
    alreadyProcessed?: boolean;
  };
  expect(callbackBody.ok).toBe(true);
  expect(callbackBody.alreadyProcessed).toBe(false);

  await expectPaidInvoiceAndActiveSubscription({
    invoiceId: checkout.invoiceId,
    ownerUserId: citizen.id,
    planCode: expected.planCode,
    amountMnt: expected.amountMnt,
    providerInvoiceId,
  });

  const duplicate = await postQpayCallback(config.baseUrl, providerInvoiceId);
  expect(duplicate.status).toBe(200);
  expect(
    (duplicate.json as { alreadyProcessed?: boolean }).alreadyProcessed,
  ).toBe(true);
  expect(
    await prisma.paymentTransaction.count({
      where: { invoiceId: checkout.invoiceId },
    }),
  ).toBe(1);

  const entitlement = await fetchJson(
    config.baseUrl,
    jar,
    "/api/ai/entitlement",
  );
  expect(entitlement.status).toBe(200);
  const entitlementBody = entitlement.json as {
    audience?: string;
    remainingLegalQuestions?: number;
    remainingKind?: string;
  };
  expect(entitlementBody.audience).toBe("paid_citizen");
  expect(entitlementBody.remainingKind).toBe("plan_quota");
  expect(entitlementBody.remainingLegalQuestions).toBe(expected.legalAiQueries);
  assertNoQpaySecretsInPayload(entitlement.json);
}

async function postQpayCallback(baseUrl: string, providerInvoiceId: string) {
  return fetchJson(baseUrl, null, "/api/billing/qpay/callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoice_id: providerInvoiceId }),
  });
}

async function expectUnpaidCallbackDoesNotActivate(input: {
  baseUrl: string;
  invoiceId: string;
  providerInvoiceId: string;
  ownerUserId: string;
  planCode: string;
}): Promise<void> {
  const unpaidCallback = await postQpayCallback(
    input.baseUrl,
    input.providerInvoiceId,
  );
  expect(unpaidCallback.status).toBe(200);
  const unpaidBody = unpaidCallback.json as { ok?: boolean; code?: string };
  expect(unpaidBody.ok).toBe(false);
  expect(unpaidBody.code).toBe("PAYMENT_NOT_SUCCESSFUL");

  const stillPending = await prisma.invoice.findUnique({
    where: { id: input.invoiceId },
  });
  expect(stillPending?.status).toBe(InvoiceStatus.PENDING);
  expect(
    await prisma.paymentTransaction.findUnique({
      where: { invoiceId: input.invoiceId },
    }),
  ).toBeNull();
  expect(
    await prisma.subscription.findFirst({
      where: {
        ownerUserId: input.ownerUserId,
        status: SubscriptionStatus.ACTIVE,
        planCode: input.planCode as "SOLO" | "CITIZEN_BASIC" | "CITIZEN_PLUS",
      },
    }),
  ).toBeNull();
}

async function waitUntilSandboxPaid(
  providerInvoiceId: string,
  config: SandboxE2eConfig,
): Promise<void> {
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
}

async function expectPaidInvoiceAndActiveSubscription(input: {
  invoiceId: string;
  ownerUserId: string;
  planCode: string;
  amountMnt: number;
  providerInvoiceId: string;
}): Promise<void> {
  const paidInvoice = await prisma.invoice.findUnique({
    where: { id: input.invoiceId },
  });
  expect(paidInvoice?.status).toBe(InvoiceStatus.PAID);
  expect(paidInvoice?.planCode).toBe(input.planCode);
  expect(paidInvoice?.providerInvoiceId).toBe(input.providerInvoiceId);

  const payment = await prisma.paymentTransaction.findUnique({
    where: { invoiceId: input.invoiceId },
  });
  expect(payment).not.toBeNull();
  expect(payment?.status).toBe("PAID");
  expect(payment?.amountMnt).toBe(input.amountMnt);
  expect(payment?.providerPaymentId).toBeTruthy();

  const subscription = await prisma.subscription.findFirst({
    where: {
      ownerUserId: input.ownerUserId,
      planCode: input.planCode as "SOLO" | "CITIZEN_BASIC" | "CITIZEN_PLUS",
      status: SubscriptionStatus.ACTIVE,
    },
  });
  expect(subscription).not.toBeNull();
  expect(subscription?.seatLimit).toBe(1);
  expect(subscription?.currentPeriodEnd.getTime()).toBe(
    expectedPeriodEnd(subscription!.currentPeriodStart).getTime(),
  );
  const now = Date.now();
  expect(subscription!.currentPeriodStart.getTime()).toBeLessThanOrEqual(now);
  expect(subscription!.currentPeriodEnd.getTime()).toBeGreaterThan(now);
}
