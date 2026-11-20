
import { describe, expect, it } from "vitest";

import { PrismaUserRepository } from "@/infrastructure/repositories/prisma-user-repository";
import type { PrismaDbClient } from "@/infrastructure/database/prisma-client";
describe("PrismaUserRepository.compareAndRotateActiveSessionIdHash", () => {
  type UpdateManyArgs = Parameters<
    PrismaDbClient["user"]["updateMany"]
  >[0];

  function createRepository(updateCount: number) {
    let capturedArgs: UpdateManyArgs | undefined;
    const db = {
      user: {
        updateMany: async (args: UpdateManyArgs) => {
          capturedArgs = args;
          return { count: updateCount };
        },
      },
    };

   const repository = new PrismaUserRepository(
  db as unknown as PrismaDbClient,
);

    return {
      repository,
     getCapturedArgs: () => capturedArgs!,
    };
  }

  it("binds a new session only when the current hash is null", async () => {
    const { repository, getCapturedArgs } = createRepository(1);

    const result = await repository.compareAndRotateActiveSessionIdHash(
      "user-1",
      null,
      "new-hash",
    );

    expect(result).toBe(true);
    expect(getCapturedArgs()).toEqual({
      where: {
        id: "user-1",
        deletedAt: null,
        activeSessionIdHash: null,
      },
      data: {
        activeSessionIdHash: "new-hash",
      },
    });
  });

  it("rotates the session when the expected hash matches", async () => {
    const { repository, getCapturedArgs } = createRepository(1);

    const result = await repository.compareAndRotateActiveSessionIdHash(
      "user-1",
      "old-hash",
      "new-hash",
    );

    expect(result).toBe(true);
    expect(getCapturedArgs().where!.activeSessionIdHash).toBe("old-hash");
    expect(getCapturedArgs().data!.activeSessionIdHash).toBe("new-hash");
  });

  it("returns false when no row matches the expected hash", async () => {
    const { repository, getCapturedArgs } = createRepository(0);

    const result = await repository.compareAndRotateActiveSessionIdHash(
      "user-1",
      "stale-hash",
      "new-hash",
    );

    expect(result).toBe(false);
    expect(getCapturedArgs().where!.activeSessionIdHash).toBe("stale-hash");
  });

  it("excludes deleted users from session rotation", async () => {
    const { repository, getCapturedArgs } = createRepository(0);

    await repository.compareAndRotateActiveSessionIdHash(
      "deleted-user",
      null,
      "new-hash",
    );

    expect(getCapturedArgs().where!.deletedAt).toBeNull();
  });
});
