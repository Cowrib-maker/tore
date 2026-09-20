import { describe, expect, it, vi } from "vitest";

import { listAdminAuditLogUseCase } from "@/application/use-cases/admin/audit-log";
import { AuditAction, UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";

function buildDeps(listResult?: object) {
  return {
    auditLogRepository: {
      list: vi.fn().mockResolvedValue(
        listResult ?? {
          items: [
            {
              id: "log-1",
              actorUserId: "admin-1",
              actorEmail: "admin@tore.mn",
              actorName: "Admin",
              action: AuditAction.SUSPEND,
              entityType: "LawyerProfile",
              entityId: "lp-1",
              metadata: { password: "x", reason: "abuse" },
              ipAddress: "203.0.113.1",
              userAgent: null,
              createdAt: new Date("2026-09-20T09:00:00.000Z"),
            },
          ],
          total: 51,
        },
      ),
    },
  } as never;
}

describe("listAdminAuditLogUseCase", () => {
  it("rejects non-ADMIN actors", async () => {
    const deps = buildDeps();
    await expect(
      listAdminAuditLogUseCase(
        { userId: "u1", role: UserRole.LAWYER },
        { page: 1 },
        deps,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("passes filters through and computes offset/limit for page 3", async () => {
    const deps = buildDeps();
    await listAdminAuditLogUseCase(
      { userId: "admin-1", role: UserRole.ADMIN },
      {
        actorSearch: "admin@tore.mn",
        entityType: "LawyerProfile",
        action: AuditAction.SUSPEND,
        dateFrom: new Date("2026-09-01T00:00:00.000Z"),
        dateTo: new Date("2026-09-30T23:59:59.999Z"),
        page: 3,
      },
      deps,
    );

    expect(
      (deps as { auditLogRepository: { list: ReturnType<typeof vi.fn> } })
        .auditLogRepository.list,
    ).toHaveBeenCalledWith({
      actorSearch: "admin@tore.mn",
      entityType: "LawyerProfile",
      action: AuditAction.SUSPEND,
      dateFrom: new Date("2026-09-01T00:00:00.000Z"),
      dateTo: new Date("2026-09-30T23:59:59.999Z"),
      limit: 25,
      offset: 50,
    });
  });

  it("clamps page 0 (and below) to page 1", async () => {
    const deps = buildDeps();
    await listAdminAuditLogUseCase(
      { userId: "admin-1", role: UserRole.ADMIN },
      { page: 0 },
      deps,
    );
    const call = (deps as { auditLogRepository: { list: ReturnType<typeof vi.fn> } })
      .auditLogRepository.list.mock.calls[0][0];
    expect(call.offset).toBe(0);
  });

  it("returns the total count for pagination and sanitizes metadata", async () => {
    const deps = buildDeps();
    const result = await listAdminAuditLogUseCase(
      { userId: "admin-1", role: UserRole.ADMIN },
      { page: 1 },
      deps,
    );
    expect(result.total).toBe(51);
    expect(result.items[0]!.metadata).toEqual({
      password: "[REDACTED]",
      reason: "abuse",
    });
    expect(result.items[0]!.actorEmail).toBe("admin@tore.mn");
  });
});
