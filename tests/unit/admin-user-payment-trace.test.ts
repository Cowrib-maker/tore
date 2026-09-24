import { describe, expect, it, vi } from "vitest";

import { getAdminUserPaymentTraceUseCase } from "@/application/use-cases/admin/payments/get-user-payment-trace";
import { UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";

const ADMIN = { userId: "admin-1", role: UserRole.ADMIN } as const;
const NON_ADMIN = { userId: "u1", role: UserRole.LAWYER } as const;

const TRACE = {
  userId: "user-1",
  userEmail: "user@tore.mn",
  userName: "Bat",
  subscriptions: [],
  unlinkedInvoices: [],
};

function buildDeps(overrides?: { findByEmail?: unknown }) {
  return {
    adminPaymentRepository: {
      getUserPaymentTrace: vi.fn().mockResolvedValue(TRACE),
    },
    userRepository: {
      findByEmail:
        overrides?.findByEmail ?? vi.fn().mockResolvedValue({ id: "user-1" }),
    },
  } as never;
}

describe("getAdminUserPaymentTraceUseCase", () => {
  it("rejects non-ADMIN actors", async () => {
    const deps = buildDeps();
    await expect(
      getAdminUserPaymentTraceUseCase(NON_ADMIN, "user-1", deps),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("looks up by userId directly when the identifier is not an email", async () => {
    const deps = buildDeps();
    const result = await getAdminUserPaymentTraceUseCase(ADMIN, "user-1", deps);
    expect(result).toEqual(TRACE);
    expect(
      (deps as { adminPaymentRepository: { getUserPaymentTrace: ReturnType<typeof vi.fn> } })
        .adminPaymentRepository.getUserPaymentTrace,
    ).toHaveBeenCalledWith("user-1");
  });

  it("resolves an email identifier to a userId via userRepository first", async () => {
    const deps = buildDeps();
    await getAdminUserPaymentTraceUseCase(ADMIN, "user@tore.mn", deps);
    expect(
      (deps as { userRepository: { findByEmail: ReturnType<typeof vi.fn> } }).userRepository
        .findByEmail,
    ).toHaveBeenCalledWith("user@tore.mn");
    expect(
      (deps as { adminPaymentRepository: { getUserPaymentTrace: ReturnType<typeof vi.fn> } })
        .adminPaymentRepository.getUserPaymentTrace,
    ).toHaveBeenCalledWith("user-1");
  });

  it("returns null when the email does not match any user", async () => {
    const deps = buildDeps({ findByEmail: vi.fn().mockResolvedValue(null) });
    const result = await getAdminUserPaymentTraceUseCase(ADMIN, "missing@tore.mn", deps);
    expect(result).toBeNull();
  });

  it("returns null for a blank identifier without querying anything", async () => {
    const deps = buildDeps();
    const result = await getAdminUserPaymentTraceUseCase(ADMIN, "   ", deps);
    expect(result).toBeNull();
    expect(
      (deps as { adminPaymentRepository: { getUserPaymentTrace: ReturnType<typeof vi.fn> } })
        .adminPaymentRepository.getUserPaymentTrace,
    ).not.toHaveBeenCalled();
  });
});
