import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/application/common/actor-context";
import { createCitizenPlanCheckout } from "@/application/use-cases/billing/create-plan-checkout";
import { createSoloCheckout } from "@/application/use-cases/billing/create-solo-checkout";
import { getOwnInvoicePaymentStatus } from "@/application/use-cases/billing/get-invoice-payment-status";
import { parseQpayCallbackInvoiceId } from "@/application/use-cases/billing/qpay-callback-parse";
import { processQpayInvoicePayment } from "@/application/use-cases/billing/process-qpay-payment";
import { assertLawyerAiOperation } from "@/application/use-cases/entitlements/assert-lawyer-ai-operation";
import { requireActiveLawyerEntitlement } from "@/application/use-cases/entitlements/ensure-lawyer-solo-subscription";
import { getLawyerBillingSnapshot } from "@/application/use-cases/entitlements/get-lawyer-billing-snapshot";
import { DEFAULT_SESSION_PROTECTION_POLICY } from "@/domain/constants/session-protection-policy";
import {
  CITIZEN_BASIC_PLAN,
  CITIZEN_PLUS_PLAN,
  SOLO_PLAN,
} from "@/domain/constants/subscription-plans";
import {
  BILLING_PROVIDER_QPAY,
  EntitlementFeature,
  InvoiceStatus,
  SeatStatus,
  SubscriptionPlanCode,
  SubscriptionStatus,
  UserRole,
} from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import { envSchema } from "@/lib/env-schema";
import {
  isQpayConfigured,
  readQpayConfig,
} from "@/infrastructure/billing/qpay-config";
import type {
  QpayCheckedPayment,
  QpayCreateInvoiceInput,
  QpayCreatedInvoice,
  QpayGateway,
} from "@/domain/ports/qpay-gateway";
import { addUtcCalendarMonth } from "@/domain/services/subscription-period";
import { InMemoryBillingUnitOfWork } from "@/infrastructure/database/in-memory-billing-unit-of-work";
import { InMemoryDeviceSessionRepository } from "@/infrastructure/repositories/in-memory-device-session-repository";
import { InMemoryEntitlementUsageRepository } from "@/infrastructure/repositories/in-memory-entitlement-usage-repository";
import {
  InMemoryInvoiceRepository,
  InMemoryPaymentTransactionRepository,
} from "@/infrastructure/repositories/in-memory-invoice-repository";
import { InMemorySubscriptionRepository } from "@/infrastructure/repositories/in-memory-subscription-repository";
import type { PlatformSettingRepository } from "@/domain/repositories/platform-setting-repository";

const lawyer: ActorContext = { userId: "lawyer-1", role: UserRole.LAWYER };
const otherLawyer: ActorContext = { userId: "lawyer-2", role: UserRole.LAWYER };
const client: ActorContext = { userId: "client-1", role: UserRole.CLIENT };
const now = new Date("2026-08-22T12:00:00.000Z");
const later = new Date("2026-08-23T12:00:00.000Z");
const CALLBACK_URL = "https://tore.test/api/billing/qpay/callback";

function paidCheck(
  paymentId = "pay-1",
  amount = 49_000,
): QpayCheckedPayment {
  return {
    count: 1,
    paidAmountMnt: amount,
    rows: [
      {
        paymentId,
        status: "PAID",
        amountMnt: amount,
        currency: "MNT",
      },
    ],
  };
}

function unpaidCheck(): QpayCheckedPayment {
  return { count: 0, paidAmountMnt: 0, rows: [] };
}

class MockQpayGateway implements QpayGateway {
  readonly created: QpayCreateInvoiceInput[] = [];
  readonly checks: string[] = [];
  nextCheck: QpayCheckedPayment = unpaidCheck();
  createResult: QpayCreatedInvoice | null = null;

  async createInvoice(input: QpayCreateInvoiceInput): Promise<QpayCreatedInvoice> {
    this.created.push(input);
    return (
      this.createResult ?? {
        providerInvoiceId: `qpay-${input.senderInvoiceNo}`,
        qrText: "qpay-qr-payload",
        qrImage: "cXJpbWFnZQ==",
        shortUrl: "https://qpay.mn/s/demo",
        urls: [
          {
            name: "Khan bank",
            description: "Pay with Khan bank",
            logo: "https://example.com/khan.png",
            link: "khanbank://qpay/demo",
          },
        ],
      }
    );
  }

  async checkPayment(providerInvoiceId: string): Promise<QpayCheckedPayment> {
    this.checks.push(providerInvoiceId);
    return this.nextCheck;
  }
}

function stubPlatformSettings(): PlatformSettingRepository {
  return {
    findByKey: async () => null,
    findMany: async () => [],
    findAll: async () => [],
    updateValue: async () => {
      throw new Error("not used");
    },
  };
}

describe("QPay-activated SOLO subscriptions", () => {
  let subscriptions: InMemorySubscriptionRepository;
  let invoices: InMemoryInvoiceRepository;
  let payments: InMemoryPaymentTransactionRepository;
  let sessions: InMemoryDeviceSessionRepository;
  let usage: InMemoryEntitlementUsageRepository;
  let qpay: MockQpayGateway;
  let fetchSpy: { mockRestore(): void };

  beforeEach(() => {
    subscriptions = new InMemorySubscriptionRepository();
    invoices = new InMemoryInvoiceRepository();
    payments = new InMemoryPaymentTransactionRepository();
    sessions = new InMemoryDeviceSessionRepository();
    usage = new InMemoryEntitlementUsageRepository();
    qpay = new MockQpayGateway();
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function billingDeps() {
    return {
      invoiceRepository: invoices,
      paymentTransactionRepository: payments,
      subscriptionRepository: subscriptions,
      billingUnitOfWork: new InMemoryBillingUnitOfWork({
        invoiceRepository: invoices,
        paymentTransactionRepository: payments,
        subscriptionRepository: subscriptions,
      }),
      qpayGateway: qpay,
      qpayCallbackUrl: CALLBACK_URL,
    };
  }

  function aiDeps() {
    return {
      subscriptionRepository: subscriptions,
      deviceSessionRepository: sessions,
      entitlementUsageRepository: usage,
    };
  }

  it("creates a 49,000 MNT SOLO invoice, saves the provider id, and returns QR/deeplink", async () => {
    const view = await createSoloCheckout(lawyer, billingDeps(), now);
    expect(view.amountMnt).toBe(49_000);
    expect(view.currency).toBe("MNT");
    expect(view.planCode).toBe("SOLO");
    expect(view.status).toBe(InvoiceStatus.PENDING);
    expect(view.qrText).toBe("qpay-qr-payload");
    expect(view.shortUrl).toBe("https://qpay.mn/s/demo");
    expect(view.deeplinks[0]?.link).toBe("khanbank://qpay/demo");

    const stored = await invoices.findById(view.invoiceId);
    expect(stored?.providerInvoiceId).toBe(`qpay-${view.invoiceId}`);
    expect(stored?.amountMnt).toBe(SOLO_PLAN.priceMnt);
    expect(qpay.created[0]?.amountMnt).toBe(49_000);
    expect(qpay.created[0]?.callbackUrl).toBe(CALLBACK_URL);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("activates a subscription only after callback + payment/check succeeds", async () => {
    const view = await createSoloCheckout(lawyer, billingDeps(), now);
    qpay.nextCheck = paidCheck("pay-success");
    const processed = await processQpayInvoicePayment(
      `qpay-${view.invoiceId}`,
      billingDeps(),
      now,
    );
    expect(qpay.checks).toEqual([`qpay-${view.invoiceId}`]);
    expect(processed.alreadyProcessed).toBe(false);
    expect(processed.invoice.status).toBe(InvoiceStatus.PAID);
    expect(processed.subscription?.status).toBe(SubscriptionStatus.ACTIVE);
    expect(processed.subscription?.currentPeriodStart).toEqual(now);
    expect(processed.subscription?.currentPeriodEnd).toEqual(
      addUtcCalendarMonth(now),
    );
    const payment = await payments.findByInvoiceId(view.invoiceId);
    expect(payment?.providerPaymentId).toBe("pay-success");
    expect(payment?.status).toBe("PAID");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("parses the documented QPay callback invoice_id body", () => {
    expect(
      parseQpayCallbackInvoiceId(
        JSON.stringify({ invoice_id: "qpay-abc" }),
        new URL("https://tore.test/api/billing/qpay/callback"),
      ),
    ).toBe("qpay-abc");
  });

  it("rejects the wrong amount and does not activate", async () => {
    const view = await createSoloCheckout(lawyer, billingDeps(), now);
    qpay.nextCheck = paidCheck("pay-wrong", 1_000);
    await expect(
      processQpayInvoicePayment(`qpay-${view.invoiceId}`, billingDeps(), now),
    ).rejects.toMatchObject({ code: "WRONG_AMOUNT" });
    expect(await subscriptions.findLatestOwnedByUserId(lawyer.userId)).toBeNull();
    expect((await invoices.findById(view.invoiceId))?.status).toBe(
      InvoiceStatus.FAILED,
    );
  });

  it("rejects an unknown provider invoice", async () => {
    await expect(
      processQpayInvoicePayment("missing-invoice", billingDeps(), now),
    ).rejects.toMatchObject({ code: "WRONG_INVOICE" });
  });

  it("does not activate when payment/check is not successful", async () => {
    const view = await createSoloCheckout(lawyer, billingDeps(), now);
    qpay.nextCheck = unpaidCheck();
    await expect(
      processQpayInvoicePayment(`qpay-${view.invoiceId}`, billingDeps(), now),
    ).rejects.toMatchObject({ code: "PAYMENT_NOT_SUCCESSFUL" });
    expect(await subscriptions.findLatestOwnedByUserId(lawyer.userId)).toBeNull();
    expect((await invoices.findById(view.invoiceId))?.status).toBe(
      InvoiceStatus.PENDING,
    );
  });

  it("treats a duplicate callback as idempotent", async () => {
    const view = await createSoloCheckout(lawyer, billingDeps(), now);
    qpay.nextCheck = paidCheck("pay-dup");
    const first = await processQpayInvoicePayment(
      `qpay-${view.invoiceId}`,
      billingDeps(),
      now,
    );
    const second = await processQpayInvoicePayment(
      `qpay-${view.invoiceId}`,
      billingDeps(),
      now,
    );
    expect(second.alreadyProcessed).toBe(true);
    expect(second.subscription?.id).toBe(first.subscription?.id);
    expect(second.subscription?.currentPeriodEnd).toEqual(
      first.subscription?.currentPeriodEnd,
    );
    expect(await invoices.listByUserId(lawyer.userId)).toHaveLength(1);
    expect(await payments.findByProviderPaymentId("pay-dup")).not.toBeNull();
    expect(qpay.checks).toHaveLength(2);
  });

  it("rejects a duplicate provider payment id without a second activation", async () => {
    const first = await createSoloCheckout(lawyer, billingDeps(), now);
    qpay.nextCheck = paidCheck("pay-shared");
    await processQpayInvoicePayment(`qpay-${first.invoiceId}`, billingDeps(), now);

    qpay.createResult = {
      providerInvoiceId: "qpay-second",
      qrText: "qr-2",
      qrImage: "img-2",
      shortUrl: "https://qpay.mn/s/2",
      urls: [],
    };
    const second = await createSoloCheckout(lawyer, billingDeps(), later);
    qpay.nextCheck = paidCheck("pay-shared");
    const before = await subscriptions.findLatestOwnedByUserId(lawyer.userId);
    await expect(
      processQpayInvoicePayment("qpay-second", billingDeps(), later),
    ).resolves.toMatchObject({ alreadyProcessed: true });
    const after = await subscriptions.findLatestOwnedByUserId(lawyer.userId);
    expect(after?.currentPeriodEnd).toEqual(before?.currentPeriodEnd);
    expect(await payments.findByInvoiceId(second.invoiceId)).toBeNull();
  });

  it("does not double-activate concurrent callbacks for the same invoice", async () => {
    const view = await createSoloCheckout(lawyer, billingDeps(), now);
    qpay.nextCheck = paidCheck("pay-race");
    const results = await Promise.all([
      processQpayInvoicePayment(`qpay-${view.invoiceId}`, billingDeps(), now),
      processQpayInvoicePayment(`qpay-${view.invoiceId}`, billingDeps(), now),
    ]);
    expect(results.filter((item) => !item.alreadyProcessed)).toHaveLength(1);
    const owned = await subscriptions.findLatestOwnedByUserId(lawyer.userId);
    expect(owned?.currentPeriodEnd).toEqual(addUtcCalendarMonth(now));
    expect(await payments.findByProviderPaymentId("pay-race")).not.toBeNull();
  });

  it("extends an active renewal from the current expiresAt", async () => {
    const first = await createSoloCheckout(lawyer, billingDeps(), now);
    qpay.nextCheck = paidCheck("pay-a");
    const activated = await processQpayInvoicePayment(
      `qpay-${first.invoiceId}`,
      billingDeps(),
      now,
    );
    qpay.createResult = {
      providerInvoiceId: "qpay-renew",
      qrText: "qr",
      qrImage: "img",
      shortUrl: null,
      urls: [],
    };
    await createSoloCheckout(lawyer, billingDeps(), later);
    qpay.nextCheck = paidCheck("pay-b");
    const renewed = await processQpayInvoicePayment(
      "qpay-renew",
      billingDeps(),
      later,
    );
    expect(renewed.subscription?.id).toBe(activated.subscription?.id);
    expect(renewed.subscription?.currentPeriodStart).toEqual(now);
    expect(renewed.subscription?.currentPeriodEnd).toEqual(
      addUtcCalendarMonth(activated.subscription!.currentPeriodEnd),
    );
  });

  it("restarts an expired renewal from payment confirmation time", async () => {
    const first = await createSoloCheckout(lawyer, billingDeps(), now);
    qpay.nextCheck = paidCheck("pay-old");
    const activated = await processQpayInvoicePayment(
      `qpay-${first.invoiceId}`,
      billingDeps(),
      now,
    );
    await subscriptions.updatePeriod(activated.subscription!.id, {
      status: SubscriptionStatus.EXPIRED,
      currentPeriodStart: now,
      currentPeriodEnd: now,
    });
    qpay.createResult = {
      providerInvoiceId: "qpay-restart",
      qrText: "qr",
      qrImage: "img",
      shortUrl: null,
      urls: [],
    };
    await createSoloCheckout(lawyer, billingDeps(), later);
    qpay.nextCheck = paidCheck("pay-new");
    const restarted = await processQpayInvoicePayment(
      "qpay-restart",
      billingDeps(),
      later,
    );
    expect(restarted.subscription?.id).toBe(activated.subscription?.id);
    expect(restarted.subscription?.status).toBe(SubscriptionStatus.ACTIVE);
    expect(restarted.subscription?.currentPeriodStart).toEqual(later);
    expect(restarted.subscription?.currentPeriodEnd).toEqual(
      addUtcCalendarMonth(later),
    );
  });

  it("blocks pending, expired, and missing subscriptions from lawyer AI", async () => {
    await expect(
      assertLawyerAiOperation(
        {
          actor: lawyer,
          policy: DEFAULT_SESSION_PROTECTION_POLICY,
          feature: EntitlementFeature.LEGAL_AI_QUERY,
          now,
        },
        aiDeps(),
      ),
    ).rejects.toMatchObject({ code: "BILLING_REQUIRED" });

    const pending = await subscriptions.create({
      ownerUserId: lawyer.userId,
      planCode: SubscriptionPlanCode.SOLO,
      status: SubscriptionStatus.PENDING,
      seatLimit: 1,
      currentPeriodStart: now,
      currentPeriodEnd: addUtcCalendarMonth(now),
    });
    await subscriptions.createSeat({
      subscriptionId: pending.id,
      userId: lawyer.userId,
      status: SeatStatus.ACTIVE,
    });
    await expect(
      assertLawyerAiOperation(
        {
          actor: lawyer,
          policy: DEFAULT_SESSION_PROTECTION_POLICY,
          feature: EntitlementFeature.LEGAL_AI_QUERY,
          now,
        },
        aiDeps(),
      ),
    ).rejects.toMatchObject({ code: "BILLING_REQUIRED" });

    await subscriptions.updatePeriod(pending.id, {
      status: SubscriptionStatus.EXPIRED,
      currentPeriodStart: now,
      currentPeriodEnd: now,
    });
    await expect(
      assertLawyerAiOperation(
        {
          actor: lawyer,
          policy: DEFAULT_SESSION_PROTECTION_POLICY,
          feature: EntitlementFeature.LEGAL_AI_QUERY,
          now,
        },
        aiDeps(),
      ),
    ).rejects.toMatchObject({ code: "BILLING_REQUIRED" });
  });

  it("allows lawyer AI only with an ACTIVE unexpired subscription", async () => {
    const view = await createSoloCheckout(lawyer, billingDeps(), now);
    qpay.nextCheck = paidCheck("pay-ai");
    await processQpayInvoicePayment(`qpay-${view.invoiceId}`, billingDeps(), now);
    const result = await assertLawyerAiOperation(
      {
        actor: lawyer,
        policy: DEFAULT_SESSION_PROTECTION_POLICY,
        feature: EntitlementFeature.LEGAL_AI_QUERY,
        now,
      },
      aiDeps(),
    );
    expect(result.entitlement.quotas.legalAiQueries).toBe(500);
    await expect(
      requireActiveLawyerEntitlement(lawyer, aiDeps(), now),
    ).resolves.toMatchObject({
      entitlement: { planCode: SubscriptionPlanCode.SOLO },
    });
  });

  it("forbids clients from billing checkout and invoice status", async () => {
    await expect(createSoloCheckout(client, billingDeps(), now)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const view = await createSoloCheckout(lawyer, billingDeps(), now);
    await expect(
      getOwnInvoicePaymentStatus(client, view.invoiceId, billingDeps(), now),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("forbids a lawyer from reading another lawyer's invoice", async () => {
    const view = await createSoloCheckout(lawyer, billingDeps(), now);
    await expect(
      getOwnInvoicePaymentStatus(otherLawyer, view.invoiceId, billingDeps(), now),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("never exposes QPay credentials or tokens on checkout/status payloads", async () => {
    const view = await createSoloCheckout(lawyer, billingDeps(), now);
    const status = await getOwnInvoicePaymentStatus(
      lawyer,
      view.invoiceId,
      billingDeps(),
      now,
    );
    const serialized = JSON.stringify({ view, status });
    expect(serialized).not.toMatch(/QPAY_CLIENT|client_secret|access_token|AUTH_SECRET/i);
    expect(view).not.toHaveProperty("clientId");
    expect(status.invoice).not.toHaveProperty("tokenCeilings");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not create an ACTIVE subscription from a billing snapshot read", async () => {
    const snapshot = await getLawyerBillingSnapshot(
      lawyer,
      { now },
      {
        subscriptionRepository: subscriptions,
        deviceSessionRepository: sessions,
        entitlementUsageRepository: usage,
        platformSettingRepository: stubPlatformSettings(),
        invoiceRepository: invoices,
      },
    );
    expect(snapshot.billingRequired).toBe(true);
    expect(snapshot.subscriptionStatus).toBe("NONE");
    expect(snapshot.planName).toBe("TORE SOLO");
    expect(snapshot.priceMnt).toBe(49_000);
    expect(snapshot.usage.legalAiQueries.limit).toBe(500);
    expect(await subscriptions.findLatestOwnedByUserId(lawyer.userId)).toBeNull();
  });

  it("keeps QPay secrets off the public env schema prefix", () => {
    const keys = Object.keys(envSchema.shape);
    expect(keys.some((key) => key.startsWith("NEXT_PUBLIC_QPAY"))).toBe(false);
    expect(keys.some((key) => key.startsWith("NEXT_PUBLIC_OPENAI"))).toBe(false);
    expect(keys).toEqual(
      expect.arrayContaining([
        "OPENAI_API_KEY",
        "QPAY_BASE_URL",
        "QPAY_CLIENT_ID",
        "QPAY_CLIENT_SECRET",
        "QPAY_CALLBACK_URL",
        "QPAY_INVOICE_CODE",
      ]),
    );
  });

  it("refuses checkout/config construction without real QPay credentials", () => {
    const unset = {
      QPAY_BASE_URL: "https://merchant-sandbox.qpay.mn",
      QPAY_CLIENT_ID: undefined,
      QPAY_CLIENT_SECRET: undefined,
      QPAY_CALLBACK_URL: undefined,
      QPAY_INVOICE_CODE: undefined,
    };
    expect(isQpayConfigured(unset)).toBe(false);
    expect(() => readQpayConfig(unset)).toThrow(
      expect.objectContaining({
        code: "BILLING_PROVIDER_NOT_CONFIGURED",
        statusCode: 503,
      }),
    );
  });

  it("is configured only when all QPay credentials and URLs are present", () => {
    const complete = {
      QPAY_BASE_URL: "https://merchant-sandbox.qpay.mn",
      QPAY_CLIENT_ID: "sandbox-client",
      QPAY_CLIENT_SECRET: "sandbox-secret",
      QPAY_CALLBACK_URL: "https://tore.test/api/billing/qpay/callback",
      QPAY_INVOICE_CODE: "SOLO_INVOICE",
    };
    expect(isQpayConfigured(complete)).toBe(true);
    expect(readQpayConfig(complete)).toEqual({
      baseUrl: "https://merchant-sandbox.qpay.mn",
      clientId: "sandbox-client",
      clientSecret: "sandbox-secret",
      callbackUrl: "https://tore.test/api/billing/qpay/callback",
      invoiceCode: "SOLO_INVOICE",
    });
    expect(
      isQpayConfigured({
        ...complete,
        QPAY_CALLBACK_URL: "not-a-url",
      }),
    ).toBe(false);
  });

  it("creates a citizen checkout from planCode using the catalog price", async () => {
    const view = await createCitizenPlanCheckout(
      client,
      SubscriptionPlanCode.CITIZEN_BASIC,
      {
        invoiceRepository: invoices,
        qpayGateway: qpay,
        qpayCallbackUrl: CALLBACK_URL,
      },
      now,
    );
    expect(view.planCode).toBe(SubscriptionPlanCode.CITIZEN_BASIC);
    expect(view.amountMnt).toBe(CITIZEN_BASIC_PLAN.priceMnt);
    expect(view.amountMnt).toBe(19_900);
    expect(qpay.created).toHaveLength(1);
    expect(qpay.created[0]?.amountMnt).toBe(19_900);
  });

  it("accepts a 19,900 MNT CITIZEN_BASIC payment and activates Basic", async () => {
    const view = await createCitizenPlanCheckout(
      client,
      SubscriptionPlanCode.CITIZEN_BASIC,
      {
        invoiceRepository: invoices,
        qpayGateway: qpay,
        qpayCallbackUrl: CALLBACK_URL,
      },
      now,
    );
    qpay.nextCheck = paidCheck("pay-basic", 19_900);
    const processed = await processQpayInvoicePayment(
      `qpay-${view.invoiceId}`,
      billingDeps(),
      now,
    );
    expect(qpay.checks).toEqual([`qpay-${view.invoiceId}`]);
    expect(processed.alreadyProcessed).toBe(false);
    expect(processed.invoice.planCode).toBe(SubscriptionPlanCode.CITIZEN_BASIC);
    expect(processed.subscription?.planCode).toBe(
      SubscriptionPlanCode.CITIZEN_BASIC,
    );
    expect(processed.subscription?.status).toBe(SubscriptionStatus.ACTIVE);
    expect(processed.invoice.status).toBe(InvoiceStatus.PAID);
  });

  it("rejects a 49,900 MNT payment against a CITIZEN_BASIC invoice", async () => {
    const view = await createCitizenPlanCheckout(
      client,
      SubscriptionPlanCode.CITIZEN_BASIC,
      {
        invoiceRepository: invoices,
        qpayGateway: qpay,
        qpayCallbackUrl: CALLBACK_URL,
      },
      now,
    );
    qpay.nextCheck = paidCheck("pay-basic-wrong", 49_900);
    await expect(
      processQpayInvoicePayment(`qpay-${view.invoiceId}`, billingDeps(), now),
    ).rejects.toMatchObject({ code: "WRONG_AMOUNT" });
    expect(await subscriptions.findLatestOwnedByUserId(client.userId)).toBeNull();
    expect((await invoices.findById(view.invoiceId))?.status).toBe(
      InvoiceStatus.FAILED,
    );
  });

  it("accepts a 49,900 MNT CITIZEN_PLUS payment and activates Plus", async () => {
    const view = await createCitizenPlanCheckout(
      client,
      SubscriptionPlanCode.CITIZEN_PLUS,
      {
        invoiceRepository: invoices,
        qpayGateway: qpay,
        qpayCallbackUrl: CALLBACK_URL,
      },
      now,
    );
    expect(view.amountMnt).toBe(CITIZEN_PLUS_PLAN.priceMnt);
    qpay.nextCheck = paidCheck("pay-plus", 49_900);
    const processed = await processQpayInvoicePayment(
      `qpay-${view.invoiceId}`,
      billingDeps(),
      now,
    );
    expect(qpay.checks).toEqual([`qpay-${view.invoiceId}`]);
    expect(processed.invoice.planCode).toBe(SubscriptionPlanCode.CITIZEN_PLUS);
    expect(processed.subscription?.planCode).toBe(
      SubscriptionPlanCode.CITIZEN_PLUS,
    );
    expect(processed.subscription?.status).toBe(SubscriptionStatus.ACTIVE);
  });

  it("rejects a 19,900 MNT payment against a CITIZEN_PLUS invoice", async () => {
    const view = await createCitizenPlanCheckout(
      client,
      SubscriptionPlanCode.CITIZEN_PLUS,
      {
        invoiceRepository: invoices,
        qpayGateway: qpay,
        qpayCallbackUrl: CALLBACK_URL,
      },
      now,
    );
    qpay.nextCheck = paidCheck("pay-plus-wrong", 19_900);
    await expect(
      processQpayInvoicePayment(`qpay-${view.invoiceId}`, billingDeps(), now),
    ).rejects.toMatchObject({ code: "WRONG_AMOUNT" });
    expect(await subscriptions.findLatestOwnedByUserId(client.userId)).toBeNull();
    expect((await invoices.findById(view.invoiceId))?.status).toBe(
      InvoiceStatus.FAILED,
    );
  });

  it("activates the stored invoice planCode, not a callback-supplied plan", async () => {
    const view = await createCitizenPlanCheckout(
      client,
      SubscriptionPlanCode.CITIZEN_BASIC,
      {
        invoiceRepository: invoices,
        qpayGateway: qpay,
        qpayCallbackUrl: CALLBACK_URL,
      },
      now,
    );
    const providerInvoiceId = parseQpayCallbackInvoiceId(
      JSON.stringify({
        invoice_id: `qpay-${view.invoiceId}`,
        planCode: SubscriptionPlanCode.CITIZEN_PLUS,
        amount: 1,
        amountMnt: 49_900,
      }),
      new URL(CALLBACK_URL),
    );
    expect(providerInvoiceId).toBe(`qpay-${view.invoiceId}`);
    qpay.nextCheck = paidCheck("pay-ignored-body", 19_900);
    const processed = await processQpayInvoicePayment(
      providerInvoiceId!,
      billingDeps(),
      now,
    );
    expect(processed.subscription?.planCode).toBe(
      SubscriptionPlanCode.CITIZEN_BASIC,
    );
    expect(processed.subscription?.planCode).not.toBe(
      SubscriptionPlanCode.CITIZEN_PLUS,
    );
    expect(processed.invoice.planCode).toBe(SubscriptionPlanCode.CITIZEN_BASIC);
  });

  it("treats a duplicate citizen callback as idempotent", async () => {
    const view = await createCitizenPlanCheckout(
      client,
      SubscriptionPlanCode.CITIZEN_BASIC,
      {
        invoiceRepository: invoices,
        qpayGateway: qpay,
        qpayCallbackUrl: CALLBACK_URL,
      },
      now,
    );
    qpay.nextCheck = paidCheck("pay-basic-dup", 19_900);
    const first = await processQpayInvoicePayment(
      `qpay-${view.invoiceId}`,
      billingDeps(),
      now,
    );
    const second = await processQpayInvoicePayment(
      `qpay-${view.invoiceId}`,
      billingDeps(),
      now,
    );
    expect(second.alreadyProcessed).toBe(true);
    expect(second.subscription?.id).toBe(first.subscription?.id);
    expect(second.subscription?.planCode).toBe(SubscriptionPlanCode.CITIZEN_BASIC);
    expect(second.subscription?.currentPeriodEnd).toEqual(
      first.subscription?.currentPeriodEnd,
    );
    expect(await invoices.listByUserId(client.userId)).toHaveLength(1);
    expect(qpay.checks).toHaveLength(2);
  });

  it("rejects an unknown planCode without activating", async () => {
    const invoice = await invoices.create({
      userId: client.userId,
      planCode: "NOT_A_PLAN" as SubscriptionPlanCode,
      amountMnt: 19_900,
      currency: "MNT",
      provider: BILLING_PROVIDER_QPAY,
      status: InvoiceStatus.PENDING,
      expiresAt: new Date(now.getTime() + 60_000),
    });
    await invoices.attachProviderInvoice(invoice.id, {
      providerInvoiceId: `qpay-${invoice.id}`,
      qrText: "qr",
      qrImage: "img",
      shortUrl: "https://qpay.mn/s/unknown",
      deeplinks: [],
    });
    qpay.nextCheck = paidCheck("pay-unknown", 19_900);
    await expect(
      processQpayInvoicePayment(`qpay-${invoice.id}`, billingDeps(), now),
    ).rejects.toMatchObject({ code: "UNPRICED_PLAN" });
    expect(await subscriptions.findLatestOwnedByUserId(client.userId)).toBeNull();
    expect((await invoices.findById(invoice.id))?.status).toBe(
      InvoiceStatus.FAILED,
    );
    expect(qpay.checks).toEqual([]);
  });

  it("rejects an unpriced TEAM planCode without activating", async () => {
    const invoice = await invoices.create({
      userId: lawyer.userId,
      planCode: SubscriptionPlanCode.TEAM,
      amountMnt: 49_000,
      currency: "MNT",
      provider: BILLING_PROVIDER_QPAY,
      status: InvoiceStatus.PENDING,
      expiresAt: new Date(now.getTime() + 60_000),
    });
    await invoices.attachProviderInvoice(invoice.id, {
      providerInvoiceId: `qpay-${invoice.id}`,
      qrText: "qr",
      qrImage: "img",
      shortUrl: "https://qpay.mn/s/team",
      deeplinks: [],
    });
    qpay.nextCheck = paidCheck("pay-team", 49_000);
    await expect(
      processQpayInvoicePayment(`qpay-${invoice.id}`, billingDeps(), now),
    ).rejects.toMatchObject({ code: "UNPRICED_PLAN" });
    expect(await subscriptions.findLatestOwnedByUserId(lawyer.userId)).toBeNull();
    expect((await invoices.findById(invoice.id))?.status).toBe(
      InvoiceStatus.FAILED,
    );
  });
});
