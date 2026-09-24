import { describe, expect, it, vi } from "vitest";

import { getAdminPaymentDashboardUseCase } from "@/application/use-cases/admin/payments/get-payment-dashboard";
import { UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";

const TOTALS = {
  totalRevenueMnt: 1_000_000,
  todayRevenueMnt: 49_000,
  monthRevenueMnt: 490_000,
  paidInvoiceCount: 20,
  pendingInvoiceCount: 3,
  failedInvoiceCount: 1,
  expiredInvoiceCount: 0,
  cancelledInvoiceCount: 0,
  totalTransactionCount: 21,
};

function buildDeps() {
  return {
    adminPaymentRepository: {
      getDashboardTotals: vi.fn().mockResolvedValue(TOTALS),
    },
  } as never;
}

describe("getAdminPaymentDashboardUseCase", () => {
  it("rejects non-ADMIN actors", async () => {
    const deps = buildDeps();
    await expect(
      getAdminPaymentDashboardUseCase({ userId: "u1", role: UserRole.LAWYER }, deps),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects CLIENT actors", async () => {
    const deps = buildDeps();
    await expect(
      getAdminPaymentDashboardUseCase({ userId: "u1", role: UserRole.CLIENT }, deps),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("returns server-side authoritative totals for ADMIN", async () => {
    const deps = buildDeps();
    const now = new Date("2026-09-24T00:00:00.000Z");
    const result = await getAdminPaymentDashboardUseCase(
      { userId: "admin-1", role: UserRole.ADMIN },
      deps,
      now,
    );
    expect(result).toEqual(TOTALS);
    expect(
      (deps as { adminPaymentRepository: { getDashboardTotals: ReturnType<typeof vi.fn> } })
        .adminPaymentRepository.getDashboardTotals,
    ).toHaveBeenCalledWith(now);
  });
});
