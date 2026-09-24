import { describe, expect, it, vi } from "vitest";

import { listAdminInvoicesUseCase } from "@/application/use-cases/admin/payments/list-invoices";
import { listAdminPaymentTransactionsUseCase } from "@/application/use-cases/admin/payments/list-payment-transactions";
import { listAdminSubscriptionsUseCase } from "@/application/use-cases/admin/payments/list-subscriptions";
import { listAdminEntitlementsUseCase } from "@/application/use-cases/admin/payments/list-entitlements";
import {
  InvoiceStatus,
  PaymentTransactionStatus,
  SubscriptionPlanCode,
  SubscriptionStatus,
  UserRole,
} from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";

const ADMIN = { userId: "admin-1", role: UserRole.ADMIN } as const;
const NON_ADMIN = { userId: "u1", role: UserRole.CLIENT } as const;

function buildDeps() {
  return {
    adminPaymentRepository: {
      listInvoices: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      listPaymentTransactions: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      listSubscriptions: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      listEntitlements: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    },
  } as never;
}

describe("listAdminInvoicesUseCase", () => {
  it("rejects non-ADMIN actors", async () => {
    const deps = buildDeps();
    await expect(
      listAdminInvoicesUseCase(NON_ADMIN, { page: 1 }, deps),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("computes offset from page and passes filters through untouched", async () => {
    const deps = buildDeps();
    await listAdminInvoicesUseCase(
      ADMIN,
      {
        status: InvoiceStatus.AWAITING_VERIFICATION,
        planCode: SubscriptionPlanCode.SOLO,
        provider: "QPAY",
        userSearch: "user@tore.mn",
        page: 3,
      },
      deps,
    );
    const call = (
      deps as { adminPaymentRepository: { listInvoices: ReturnType<typeof vi.fn> } }
    ).adminPaymentRepository.listInvoices.mock.calls[0][0];
    expect(call).toEqual({
      status: InvoiceStatus.AWAITING_VERIFICATION,
      planCode: SubscriptionPlanCode.SOLO,
      provider: "QPAY",
      userSearch: "user@tore.mn",
      dateFrom: undefined,
      dateTo: undefined,
      limit: 25,
      offset: 50,
    });
  });

  it("clamps page 0 and below to page 1 (offset 0)", async () => {
    const deps = buildDeps();
    await listAdminInvoicesUseCase(ADMIN, { page: -5 }, deps);
    const call = (
      deps as { adminPaymentRepository: { listInvoices: ReturnType<typeof vi.fn> } }
    ).adminPaymentRepository.listInvoices.mock.calls[0][0];
    expect(call.offset).toBe(0);
  });
});

describe("listAdminPaymentTransactionsUseCase", () => {
  it("rejects non-ADMIN actors", async () => {
    const deps = buildDeps();
    await expect(
      listAdminPaymentTransactionsUseCase(NON_ADMIN, { page: 1 }, deps),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("filters by status for ADMIN", async () => {
    const deps = buildDeps();
    await listAdminPaymentTransactionsUseCase(
      ADMIN,
      { status: PaymentTransactionStatus.PAID, page: 1 },
      deps,
    );
    expect(
      (
        deps as {
          adminPaymentRepository: { listPaymentTransactions: ReturnType<typeof vi.fn> };
        }
      ).adminPaymentRepository.listPaymentTransactions,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ status: PaymentTransactionStatus.PAID, limit: 25, offset: 0 }),
    );
  });
});

describe("listAdminSubscriptionsUseCase", () => {
  it("rejects non-ADMIN actors", async () => {
    const deps = buildDeps();
    await expect(
      listAdminSubscriptionsUseCase(NON_ADMIN, { page: 1 }, deps),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("filters by status and plan for ADMIN", async () => {
    const deps = buildDeps();
    await listAdminSubscriptionsUseCase(
      ADMIN,
      { status: SubscriptionStatus.ACTIVE, planCode: SubscriptionPlanCode.SOLO, page: 2 },
      deps,
    );
    expect(
      (
        deps as { adminPaymentRepository: { listSubscriptions: ReturnType<typeof vi.fn> } }
      ).adminPaymentRepository.listSubscriptions,
    ).toHaveBeenCalledWith({
      status: SubscriptionStatus.ACTIVE,
      planCode: SubscriptionPlanCode.SOLO,
      userSearch: undefined,
      limit: 25,
      offset: 25,
    });
  });
});

describe("listAdminEntitlementsUseCase", () => {
  it("rejects non-ADMIN actors", async () => {
    const deps = buildDeps();
    await expect(
      listAdminEntitlementsUseCase(NON_ADMIN, { page: 1 }, deps),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("passes activeOnly filter through for ADMIN", async () => {
    const deps = buildDeps();
    await listAdminEntitlementsUseCase(ADMIN, { activeOnly: true, page: 1 }, deps);
    expect(
      (
        deps as { adminPaymentRepository: { listEntitlements: ReturnType<typeof vi.fn> } }
      ).adminPaymentRepository.listEntitlements,
    ).toHaveBeenCalledWith({
      userSearch: undefined,
      activeOnly: true,
      limit: 25,
      offset: 0,
    });
  });
});
