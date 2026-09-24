import { describe, expect, it, vi } from "vitest";

import { getAdminQpayDiagnosticsUseCase } from "@/application/use-cases/admin/payments/get-qpay-diagnostics";
import { qpayEnvironmentLabel } from "@/domain/services/qpay-diagnostics";
import { UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";

const ADMIN = { userId: "admin-1", role: UserRole.ADMIN } as const;
const NON_ADMIN = { userId: "u1", role: UserRole.CLIENT } as const;

const SUMMARY = {
  lastInvoiceCreatedAt: new Date("2026-09-20T00:00:00.000Z"),
  lastPaymentPaidAt: new Date("2026-09-21T00:00:00.000Z"),
  paidInvoiceCount: 5,
  failedInvoiceCount: 1,
  pendingInvoiceCount: 2,
};

function buildDeps(configured: boolean, baseUrl: string) {
  return {
    adminPaymentRepository: {
      getQpayActivitySummary: vi.fn().mockResolvedValue(SUMMARY),
    },
    isQpayConfigured: vi.fn().mockReturnValue(configured),
    qpayBaseUrl: baseUrl,
  } as never;
}

describe("qpayEnvironmentLabel", () => {
  it("labels a sandbox host as SANDBOX", () => {
    expect(qpayEnvironmentLabel("https://merchant-sandbox.qpay.mn")).toBe("SANDBOX");
  });

  it("labels any non-sandbox host as PRODUCTION", () => {
    expect(qpayEnvironmentLabel("https://merchant.qpay.mn")).toBe("PRODUCTION");
  });
});

describe("getAdminQpayDiagnosticsUseCase", () => {
  it("rejects non-ADMIN actors", async () => {
    const deps = buildDeps(true, "https://merchant.qpay.mn");
    await expect(
      getAdminQpayDiagnosticsUseCase(NON_ADMIN, deps),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("returns only safe, derived metadata for ADMIN — never a secret field", async () => {
    const deps = buildDeps(true, "https://merchant-sandbox.qpay.mn");
    const result = await getAdminQpayDiagnosticsUseCase(ADMIN, deps);

    expect(result).toEqual({
      environment: "SANDBOX",
      configured: true,
      lastInvoiceCreatedAt: SUMMARY.lastInvoiceCreatedAt,
      lastPaymentPaidAt: SUMMARY.lastPaymentPaidAt,
      paidInvoiceCount: 5,
      failedInvoiceCount: 1,
      pendingInvoiceCount: 2,
    });

    const forbiddenKeys = ["clientSecret", "client_secret", "accessToken", "access_token", "refreshToken", "refresh_token", "password", "authorization", "Authorization"];
    for (const key of forbiddenKeys) {
      expect(Object.prototype.hasOwnProperty.call(result, key)).toBe(false);
    }
  });

  it("reports configured:false when isQpayConfigured() returns false", async () => {
    const deps = buildDeps(false, "https://merchant.qpay.mn");
    const result = await getAdminQpayDiagnosticsUseCase(ADMIN, deps);
    expect(result.configured).toBe(false);
    expect(result.environment).toBe("PRODUCTION");
  });
});
