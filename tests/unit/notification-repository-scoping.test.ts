import { describe, expect, it } from "vitest";

import { PrismaNotificationRepository } from "@/infrastructure/repositories/prisma-notification-repository";

/**
 * P1 hardening milestone — notification.markRead ownership scoping.
 *
 * Prior state: markRead(ids: string[]) had no userId in its where clause at
 * all; only the single existing caller (markNotificationReadAction) checked
 * ownership before calling it, so the repository primitive itself was an
 * IDOR trap for any future caller. Fixed by adding userId to the query.
 *
 * This is a true unit test of the repository class itself — PrismaDbClient
 * is injectable via the constructor, so a fake `db` in-memory-filters
 * exactly the way a real `updateMany({ where: { id: { in }, userId } })`
 * would, proving the QUERY SHAPE actually restricts writes, not just that
 * the right arguments were passed.
 */

type FakeRow = { id: string; userId: string; readAt: Date | null };

function fakeDb(rows: FakeRow[]) {
  return {
    notification: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: { in: string[] }; userId: string };
        data: { readAt: Date };
      }) => {
        let count = 0;
        for (const row of rows) {
          if (where.id.in.includes(row.id) && row.userId === where.userId) {
            row.readAt = data.readAt;
            count += 1;
          }
        }
        return { count };
      },
    },
  } as never;
}

describe("PrismaNotificationRepository.markRead — ownership scoping", () => {
  it("marks the caller's own notification read", async () => {
    const rows: FakeRow[] = [{ id: "n1", userId: "alice", readAt: null }];
    const repo = new PrismaNotificationRepository(fakeDb(rows));

    await repo.markRead("alice", ["n1"]);

    expect(rows[0]!.readAt).not.toBeNull();
  });

  it("does not mark a foreign notification read, even when its id is supplied directly", async () => {
    const rows: FakeRow[] = [{ id: "n1", userId: "bob", readAt: null }];
    const repo = new PrismaNotificationRepository(fakeDb(rows));

    await repo.markRead("alice", ["n1"]);

    expect(rows[0]!.readAt).toBeNull();
  });

  it("a mixed batch (own + foreign ids) only affects the caller's own notifications", async () => {
    const rows: FakeRow[] = [
      { id: "n-own-1", userId: "alice", readAt: null },
      { id: "n-own-2", userId: "alice", readAt: null },
      { id: "n-foreign", userId: "bob", readAt: null },
    ];
    const repo = new PrismaNotificationRepository(fakeDb(rows));

    await repo.markRead("alice", ["n-own-1", "n-own-2", "n-foreign"]);

    expect(rows[0]!.readAt).not.toBeNull();
    expect(rows[1]!.readAt).not.toBeNull();
    expect(rows[2]!.readAt).toBeNull();
  });

  it("an empty id list is a safe no-op (never calls the database)", async () => {
    const rows: FakeRow[] = [{ id: "n1", userId: "alice", readAt: null }];
    let called = false;
    const db = {
      notification: {
        updateMany: async () => {
          called = true;
          return { count: 0 };
        },
      },
    } as never;
    const repo = new PrismaNotificationRepository(db);

    await repo.markRead("alice", []);

    expect(called).toBe(false);
    expect(rows[0]!.readAt).toBeNull();
  });

  it("a nonexistent id behaves safely — no match, no throw, other rows untouched", async () => {
    const rows: FakeRow[] = [{ id: "n1", userId: "alice", readAt: null }];
    const repo = new PrismaNotificationRepository(fakeDb(rows));

    await expect(
      repo.markRead("alice", ["does-not-exist"]),
    ).resolves.toBeUndefined();
    expect(rows[0]!.readAt).toBeNull();
  });
});
