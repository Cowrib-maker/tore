import { describe, expect, it } from "vitest";

import { DeviceSessionStatus } from "@/domain/enums";
import { PrismaDeviceSessionRepository } from "@/infrastructure/repositories/prisma-device-session-repository";
import { InMemoryDeviceSessionRepository } from "@/infrastructure/repositories/in-memory-device-session-repository";

/**
 * P1 hardening milestone — deviceSession.revoke ownership scoping.
 *
 * Prior state: revoke(id: string) had no userId in its where clause; only
 * the single existing caller (revokeOwnDeviceSession) checked ownership
 * first. Fixed by requiring userId in the query itself, and by having the
 * primitive return null (never throw) for a foreign or nonexistent id —
 * matching this codebase's existing "don't leak existence" convention.
 */

type FakeRow = {
  id: string;
  userId: string;
  status: DeviceSessionStatus;
  revokedAt: Date | null;
};

function fakeDb(rows: FakeRow[]) {
  return {
    deviceSession: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; userId: string };
        data: { status: DeviceSessionStatus; revokedAt: Date };
      }) => {
        let count = 0;
        for (const row of rows) {
          if (row.id === where.id && row.userId === where.userId) {
            row.status = data.status;
            row.revokedAt = data.revokedAt;
            count += 1;
          }
        }
        return { count };
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = rows.find((r) => r.id === where.id);
        return row
          ? {
              id: row.id,
              userId: row.userId,
              subscriptionId: null,
              userAgent: null,
              ipHash: null,
              firstSeenAt: new Date(),
              lastSeenAt: new Date(),
              revokedAt: row.revokedAt,
              status: row.status,
              requestCountWindowStart: null,
              requestCountInWindow: 0,
            }
          : null;
      },
    },
  } as never;
}

describe("PrismaDeviceSessionRepository.revoke — ownership scoping", () => {
  it("revokes the caller's own device session", async () => {
    const rows: FakeRow[] = [
      { id: "s1", userId: "alice", status: DeviceSessionStatus.ACTIVE, revokedAt: null },
    ];
    const repo = new PrismaDeviceSessionRepository(fakeDb(rows));
    const now = new Date();

    const result = await repo.revoke("alice", "s1", now);

    expect(result?.status).toBe(DeviceSessionStatus.REVOKED);
    expect(rows[0]!.status).toBe(DeviceSessionStatus.REVOKED);
  });

  it("does not revoke a foreign device session, even when its id is supplied directly", async () => {
    const rows: FakeRow[] = [
      { id: "s1", userId: "bob", status: DeviceSessionStatus.ACTIVE, revokedAt: null },
    ];
    const repo = new PrismaDeviceSessionRepository(fakeDb(rows));

    const result = await repo.revoke("alice", "s1", new Date());

    expect(result).toBeNull();
    expect(rows[0]!.status).toBe(DeviceSessionStatus.ACTIVE);
  });

  it("a nonexistent session id is handled safely — returns null, never throws", async () => {
    const repo = new PrismaDeviceSessionRepository(fakeDb([]));

    await expect(
      repo.revoke("alice", "does-not-exist", new Date()),
    ).resolves.toBeNull();
  });
});

describe("InMemoryDeviceSessionRepository.revoke — ownership scoping (test-fake parity)", () => {
  it("mirrors the same own/foreign/nonexistent behavior as the Prisma implementation", async () => {
    const repo = new InMemoryDeviceSessionRepository();
    repo.seed({
      id: "s1",
      userId: "alice",
      subscriptionId: null,
      userAgent: null,
      ipHash: null,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      revokedAt: null,
      status: DeviceSessionStatus.ACTIVE,
      requestCountWindowStart: null,
      requestCountInWindow: 0,
    });

    expect(await repo.revoke("bob", "s1", new Date())).toBeNull();
    expect((await repo.findById("s1"))?.status).toBe(DeviceSessionStatus.ACTIVE);

    expect(await repo.revoke("alice", "does-not-exist", new Date())).toBeNull();

    const revoked = await repo.revoke("alice", "s1", new Date());
    expect(revoked?.status).toBe(DeviceSessionStatus.REVOKED);
  });
});
