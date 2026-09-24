import { describe, expect, it, vi } from "vitest";

import { verifyAdminQpayInvoiceUseCase } from "@/application/use-cases/admin/payments/verify-qpay-invoice";
import * as processQpayPaymentModule from "@/application/use-cases/billing/process-qpay-payment";
import { BILLING_PROVIDER_MANUAL_QR, BILLING_PROVIDER_QPAY, UserRole } from "@/domain/enums";
import { ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors/domain-error";

const ADMIN = { userId: "admin-1", role: UserRole.ADMIN } as const;
const NON_ADMIN = { userId: "u1", role: UserRole.LAWYER } as const;

const QPAY_INVOICE = {
  id: "invoice-1",
  provider: BILLING_PROVIDER_QPAY,
  providerInvoiceId: "qpay-inv-1",
};

function buildDeps(invoice: unknown) {
  return {
    invoiceRepository: {
      findById: vi.fn().mockResolvedValue(invoice),
    },
  } as never;
}

describe("verifyAdminQpayInvoiceUseCase", () => {
  it("rejects non-ADMIN actors before touching any repository", async () => {
    const deps = buildDeps(QPAY_INVOICE);
    await expect(
      verifyAdminQpayInvoiceUseCase(NON_ADMIN, "invoice-1", deps),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(
      (deps as { invoiceRepository: { findById: ReturnType<typeof vi.fn> } }).invoiceRepository
        .findById,
    ).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the invoice does not exist", async () => {
    const deps = buildDeps(null);
    await expect(
      verifyAdminQpayInvoiceUseCase(ADMIN, "missing", deps),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects a non-QPay invoice rather than running QPay verification on it", async () => {
    const deps = buildDeps({
      id: "invoice-2",
      provider: BILLING_PROVIDER_MANUAL_QR,
      providerInvoiceId: "manual-ref",
    });
    await expect(
      verifyAdminQpayInvoiceUseCase(ADMIN, "invoice-2", deps),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a QPay invoice with no providerInvoiceId", async () => {
    const deps = buildDeps({
      id: "invoice-3",
      provider: BILLING_PROVIDER_QPAY,
      providerInvoiceId: null,
    });
    await expect(
      verifyAdminQpayInvoiceUseCase(ADMIN, "invoice-3", deps),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("delegates to the real processQpayInvoicePayment verification path — never a manual mark-as-paid", async () => {
    const deps = buildDeps(QPAY_INVOICE);
    const spy = vi
      .spyOn(processQpayPaymentModule, "processQpayInvoicePayment")
      .mockResolvedValue({
        alreadyProcessed: false,
        invoice: { ...QPAY_INVOICE, status: "PAID" } as never,
        subscription: null,
      });

    const now = new Date("2026-09-24T00:00:00.000Z");
    await verifyAdminQpayInvoiceUseCase(ADMIN, "invoice-1", deps, now);

    expect(spy).toHaveBeenCalledWith("qpay-inv-1", deps, now);
    spy.mockRestore();
  });
});
