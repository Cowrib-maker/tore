import { describe, expect, it, vi } from "vitest";

import { getAdminDashboardOverviewUseCase } from "@/application/use-cases/admin/dashboard-overview";
import { BookingStatus, UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";

function buildDeps(overrides: {
  userCounts?: object;
  pendingItems?: object[];
  bookingCounts?: object;
  recentAuditList?: object;
} = {}) {
  const userCounts = overrides.userCounts ?? {
    total: 10,
    byRole: { [UserRole.CLIENT]: 6, [UserRole.LAWYER]: 3, [UserRole.ADMIN]: 1 },
    byStatus: { ACTIVE: 8, SUSPENDED: 2, DEACTIVATED: 0 },
  };
  const bookingCounts =
    overrides.bookingCounts ??
    Object.fromEntries(Object.values(BookingStatus).map((s) => [s, 0]));

  return {
    userRepository: {
      getPlatformUserCounts: vi.fn().mockResolvedValue(userCounts),
    },
    lawyerCredentialRepository: {
      findPendingReview: vi.fn().mockResolvedValue({
        items: overrides.pendingItems ?? [{ id: "c1" }, { id: "c2" }],
        nextCursor: null,
      }),
    },
    bookingRepository: {
      countByStatus: vi.fn().mockResolvedValue(bookingCounts),
    },
    auditLogRepository: {
      list: vi.fn().mockResolvedValue(
        overrides.recentAuditList ?? {
          items: [
            {
              id: "log-1",
              actorUserId: "admin-1",
              actorEmail: "admin@tore.mn",
              actorName: "Admin",
              action: "UPDATE",
              entityType: "User",
              entityId: "u-1",
              metadata: { token: "abc" },
              ipAddress: null,
              userAgent: null,
              createdAt: new Date("2026-09-20T10:00:00.000Z"),
            },
          ],
          total: 3,
        },
      ),
    },
  } as never;
}

describe("getAdminDashboardOverviewUseCase", () => {
  it("rejects non-ADMIN actors", async () => {
    const deps = buildDeps();
    await expect(
      getAdminDashboardOverviewUseCase(
        { userId: "u1", role: UserRole.CLIENT },
        deps,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("aggregates user counts, pending verifications, booking counts, and recent activity", async () => {
    const deps = buildDeps();
    const result = await getAdminDashboardOverviewUseCase(
      { userId: "admin-1", role: UserRole.ADMIN },
      deps,
    );

    expect(result.userCounts.total).toBe(10);
    expect(result.userCounts.byRole[UserRole.LAWYER]).toBe(3);
    expect(result.pendingVerifications).toBe(2);
    expect(result.bookingCounts[BookingStatus.CONFIRMED]).toBe(0);
    expect(result.recentActivity.last24hCount).toBe(3);
    expect(result.recentActivity.items).toHaveLength(1);
  });

  it("queries recent activity within a 24-hour window from `now`", async () => {
    const deps = buildDeps();
    const now = new Date("2026-09-20T12:00:00.000Z");
    await getAdminDashboardOverviewUseCase(
      { userId: "admin-1", role: UserRole.ADMIN },
      deps,
      now,
    );
    const listCall = (deps as { auditLogRepository: { list: ReturnType<typeof vi.fn> } })
      .auditLogRepository.list.mock.calls[0][0];
    expect(listCall.dateFrom.toISOString()).toBe("2026-09-19T12:00:00.000Z");
    expect(listCall.limit).toBe(5);
    expect(listCall.offset).toBe(0);
  });

  it("sanitizes sensitive metadata in the recent-activity preview", async () => {
    const deps = buildDeps();
    const result = await getAdminDashboardOverviewUseCase(
      { userId: "admin-1", role: UserRole.ADMIN },
      deps,
    );
    expect(result.recentActivity.items[0]!.metadata).toEqual({
      token: "[REDACTED]",
    });
  });
});
