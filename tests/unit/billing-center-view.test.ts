import { describe, expect, it } from "vitest";

import {
  toBillingCenterPendingInvoice,
  toBillingHistoryRow,
} from "@/application/use-cases/billing/billing-center-view";
import {
  BILLING_PROVIDER_MANUAL_BANK_TRANSFER,
  BILLING_PROVIDER_MANUAL_QR,
  BILLING_PROVIDER_QPAY,
  InvoiceStatus,
  SubscriptionPlanCode,
} from "@/domain/enums";
import type { Invoice } from "@/domain/entities/invoice";
import type { ManualPaymentConfig } from "@/infrastructure/billing/manual/manual-payment-config";

const CONFIG: ManualPaymentConfig = {
  enabled: true,
  bankName: "Төрийн банк",
  bankAccountNumber: "MN690034109201930536",
  bankAccountName: "ТОРЕ ТЕХНОЛОЖИ",
  qrAssetUrl: "/brand/qpay-printed-qr.png",
};

function baseInvoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: "inv_1234567890",
    userId: "user-1",
    subscriptionId: null,
    bookingId: null,
    planCode: SubscriptionPlanCode.CITIZEN_BASIC,
    amountMnt: 19_900,
    currency: "MNT",
    provider: BILLING_PROVIDER_MANUAL_QR,
    providerInvoiceId: "TORE-90567890",
    status: InvoiceStatus.PENDING,
    expiresAt: new Date("2026-01-02T00:00:00.000Z"),
    qrText: null,
    qrImage: null,
    shortUrl: null,
    deeplinks: [],
    verifiedByUserId: null,
    verifiedAt: null,
    rejectionReason: null,
    paymentCode: "0378",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("toBillingCenterPendingInvoice", () => {
  it("derives QR method and includes real bank details for a manual QR invoice", () => {
    const view = toBillingCenterPendingInvoice(baseInvoice({}), CONFIG);
    expect(view.method).toBe("QR");
    expect(view.reference).toBe("0378");
    expect(view.paymentCode).toBe("0378");
    expect(view.bankName).toBe("Төрийн банк");
    expect(view.bankAccountNumber).toBe("MN690034109201930536");
    expect(view.qrAssetUrl).toBe("/brand/qpay-printed-qr.png");
  });

  it("derives BANK_TRANSFER method and omits the QR asset", () => {
    const view = toBillingCenterPendingInvoice(
      baseInvoice({ provider: BILLING_PROVIDER_MANUAL_BANK_TRANSFER }),
      CONFIG,
    );
    expect(view.method).toBe("BANK_TRANSFER");
    expect(view.qrAssetUrl).toBeNull();
    expect(view.bankAccountNumber).toBe("MN690034109201930536");
  });

  it("derives QPAY method and never exposes manual bank details or a payment code reference", () => {
    const view = toBillingCenterPendingInvoice(
      baseInvoice({ provider: BILLING_PROVIDER_QPAY, paymentCode: null }),
      CONFIG,
    );
    expect(view.method).toBe("QPAY");
    expect(view.reference).toBeNull();
    expect(view.bankName).toBeNull();
    expect(view.bankAccountNumber).toBeNull();
  });

  it("falls back to the provider reference when a pre-existing invoice has no paymentCode", () => {
    const view = toBillingCenterPendingInvoice(baseInvoice({ paymentCode: null }), CONFIG);
    expect(view.reference).toBe("TORE-90567890");
  });

  it("is a superset of the older SoloCheckoutView fields so existing consumers keep working", () => {
    const view = toBillingCenterPendingInvoice(baseInvoice({}), CONFIG);
    expect(view.currency).toBe("MNT");
    expect(view.qrText).toBeNull();
    expect(Array.isArray(view.deeplinks)).toBe(true);
    expect(typeof view.expiresAt).toBe("string");
  });
});

describe("toBillingHistoryRow", () => {
  it("maps a paid citizen invoice with its real plan name and amount", () => {
    const row = toBillingHistoryRow(
      baseInvoice({ status: InvoiceStatus.PAID, planCode: SubscriptionPlanCode.CITIZEN_PLUS, amountMnt: 49_900 }),
    );
    expect(row.planName).toBe("TORE Citizen Plus");
    expect(row.amountMnt).toBe(49_900);
    expect(row.status).toBe(InvoiceStatus.PAID);
    expect(row.method).toBe("QR");
  });

  it("keeps planName null for an invoice with no planCode rather than guessing", () => {
    const row = toBillingHistoryRow(baseInvoice({ planCode: null }));
    expect(row.planName).toBeNull();
  });
});
