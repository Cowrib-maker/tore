import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/application/common/actor-context";
import { createMatterForActor } from "@/application/use-cases/matters/create-matter";
import { listMattersForActor } from "@/application/use-cases/matters/list-matters";
import { loadMatterOverviewForActor } from "@/application/use-cases/matters/matter-overview";
import { updateMatterForActor } from "@/application/use-cases/matters/update-matter";
import { assertOwnedMatterForAi } from "@/application/use-cases/matters/matter-conversation";
import type {
  CreateMatterInput,
  Matter,
} from "@/domain/entities/matter";
import type {
  MatterRepository,
  UpdateMatterPatch,
} from "@/domain/repositories/matter-repository";
import { UserRole } from "@/domain/enums";

/** A faithful in-memory MatterRepository -- real filter/ownership logic,
 * not canned return values -- so these tests actually exercise the
 * boundary loadMatterOverviewForActor/requireOwnedMatter depend on. */
function fakeMatterRepository(seed: Matter[] = []) {
  const rows = new Map(seed.map((matter) => [matter.id, matter]));
  let nextId = seed.length + 1;
  const calls = { findById: 0, create: 0, update: 0 };

  const repository: MatterRepository = {
    async create(input: CreateMatterInput) {
      calls.create += 1;
      const now = new Date();
      const matter: Matter = {
        id: `matter-${nextId++}`,
        ownerId: input.ownerId,
        title: input.title,
        type: input.type,
        description: input.description,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      };
      rows.set(matter.id, matter);
      return matter;
    },
    async findById(id: string) {
      calls.findById += 1;
      return rows.get(id) ?? null;
    },
    async listByOwnerId(ownerId: string) {
      return [...rows.values()].filter((matter) => matter.ownerId === ownerId);
    },
    async update(id: string, patch: UpdateMatterPatch) {
      calls.update += 1;
      const existing = rows.get(id);
      if (!existing) throw new Error("not found");
      const updated: Matter = {
        ...existing,
        ...patch,
        updatedAt: new Date(),
      };
      rows.set(id, updated);
      return updated;
    },
    async countConversationsByMatterIds(matterIds: string[]) {
      return Object.fromEntries(matterIds.map((id) => [id, 0]));
    },
  };

  return { repository, rows, calls };
}

const owner: ActorContext = { userId: "user-1", role: UserRole.CLIENT };
const attacker: ActorContext = { userId: "user-2", role: UserRole.CLIENT };

describe("createMatterForActor — validation", () => {
  it("rejects an empty title", async () => {
    const { repository } = fakeMatterRepository();
    await expect(
      createMatterForActor(owner, { title: "   " }, repository),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects an invalid type", async () => {
    const { repository } = fakeMatterRepository();
    await expect(
      createMatterForActor(owner, { title: "Хэрэг", type: "NOT_A_TYPE" }, repository),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("creates a Matter owned by the acting user, defaulting type to GENERAL", async () => {
    const { repository } = fakeMatterRepository();
    const matter = await createMatterForActor(
      owner,
      { title: "  Н.Ажилтны хөдөлмөрийн маргаан  " },
      repository,
    );
    expect(matter.ownerId).toBe(owner.userId);
    expect(matter.title).toBe("Н.Ажилтны хөдөлмөрийн маргаан");
    expect(matter.type).toBe("GENERAL");
  });
});

describe("Matter ownership authorization boundary", () => {
  it("lets the owner load their own Matter overview", async () => {
    const { repository } = fakeMatterRepository();
    const matter = await createMatterForActor(owner, { title: "Хэрэг" }, repository);
    const overview = await loadMatterOverviewForActor(owner, matter.id, repository);
    expect(overview.id).toBe(matter.id);
  });

  it("refuses another user's Matter with ForbiddenError, not a data leak", async () => {
    const { repository } = fakeMatterRepository();
    const matter = await createMatterForActor(owner, { title: "Хэрэг" }, repository);
    await expect(
      loadMatterOverviewForActor(attacker, matter.id, repository),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns NotFoundError for a non-existent matterId, indistinguishable in shape from ForbiddenError", async () => {
    const { repository } = fakeMatterRepository();
    await expect(
      loadMatterOverviewForActor(owner, "matter-does-not-exist", repository),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("never lists another user's Matters", async () => {
    const { repository } = fakeMatterRepository();
    await createMatterForActor(owner, { title: "Миний хэрэг" }, repository);
    await createMatterForActor(attacker, { title: "Хүний хэрэг" }, repository);

    const ownerMatters = await listMattersForActor(owner, repository);
    expect(ownerMatters).toHaveLength(1);
    expect(ownerMatters[0]!.title).toBe("Миний хэрэг");
  });

  it("lets the owner update their own Matter", async () => {
    const { repository } = fakeMatterRepository();
    const matter = await createMatterForActor(owner, { title: "Хэрэг" }, repository);
    const updated = await updateMatterForActor(
      owner,
      matter.id,
      { status: "ARCHIVED" },
      repository,
    );
    expect(updated.status).toBe("ARCHIVED");
  });

  it("refuses to update another user's Matter", async () => {
    const { repository } = fakeMatterRepository();
    const matter = await createMatterForActor(owner, { title: "Хэрэг" }, repository);
    await expect(
      updateMatterForActor(attacker, matter.id, { status: "ARCHIVED" }, repository),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("assertOwnedMatterForAi — the AI-attach security boundary", () => {
  it("allows the owner to attach a conversation to their own Matter", async () => {
    const { repository } = fakeMatterRepository();
    const matter = await createMatterForActor(owner, { title: "Хэрэг" }, repository);
    await expect(
      assertOwnedMatterForAi(owner, matter.id, repository),
    ).resolves.toBeUndefined();
  });

  it("blocks a different authenticated user from attaching to someone else's Matter (unauthorized matterId cannot open Matter AI)", async () => {
    const { repository } = fakeMatterRepository();
    const matter = await createMatterForActor(owner, { title: "Хэрэг" }, repository);
    await expect(
      assertOwnedMatterForAi(attacker, matter.id, repository),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks a guessed, non-existent matterId the same way as an unowned one", async () => {
    const { repository } = fakeMatterRepository();
    await expect(
      assertOwnedMatterForAi(owner, "matter-guessed-id", repository),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("performs only a read (findById) — no write, no entitlement side effect — so opening a Matter AI page never consumes a question", async () => {
    const { repository, calls } = fakeMatterRepository();
    const matter = await createMatterForActor(owner, { title: "Хэрэг" }, repository);
    calls.create = 0;
    calls.findById = 0;
    calls.update = 0;

    await assertOwnedMatterForAi(owner, matter.id, repository);

    expect(calls.findById).toBe(1);
    expect(calls.create).toBe(0);
    expect(calls.update).toBe(0);
  });
});
