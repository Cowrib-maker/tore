import { describe, expect, it, vi } from "vitest";

import {
  researchMatterForActor,
  type ResearchMatterDeps,
} from "@/application/use-cases/matters/research-matter";
import type { CreateMatterInput, Matter } from "@/domain/entities/matter";
import type {
  MatterRepository,
  UpdateMatterPatch,
} from "@/domain/repositories/matter-repository";
import { UserRole } from "@/domain/enums";
import { ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors/domain-error";

const owner = { userId: "user-1", role: UserRole.CLIENT };
const attacker = { userId: "user-2", role: UserRole.CLIENT };

function fakeMatterRepository(seed: Matter[]): MatterRepository {
  const rows = new Map(seed.map((matter) => [matter.id, matter]));
  return {
    async create(input: CreateMatterInput) {
      const matter: Matter = {
        id: "matter-new",
        ownerId: input.ownerId,
        title: input.title,
        type: input.type,
        description: input.description,
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      rows.set(matter.id, matter);
      return matter;
    },
    async findById(id: string) {
      return rows.get(id) ?? null;
    },
    async listByOwnerId(ownerId: string) {
      return [...rows.values()].filter((matter) => matter.ownerId === ownerId);
    },
    async update(id: string, patch: UpdateMatterPatch) {
      const existing = rows.get(id);
      if (!existing) throw new Error("not found");
      const updated = { ...existing, ...patch, updatedAt: new Date() };
      rows.set(id, updated);
      return updated;
    },
    async countConversationsByMatterIds(matterIds: string[]) {
      return Object.fromEntries(matterIds.map((id) => [id, 0]));
    },
  };
}

function baseMatter(id: string, ownerId: string): Matter {
  return {
    id,
    ownerId,
    title: "Хэрэг",
    type: "GENERAL",
    description: null,
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("researchMatterForActor", () => {
  it("lets the owner research their own Matter, routing through createTurn with researchMode", async () => {
    const matterRepository = fakeMatterRepository([baseMatter("matter-1", owner.userId)]);
    const createTurn = vi.fn<ResearchMatterDeps["createTurn"]>(async () => ({
      conversationId: "conv-1",
      message: { id: "msg-1", role: "ASSISTANT" as const, content: "Судалгааны дүгнэлт...", citations: [] },
      usage: { inputTokens: 1, outputTokens: 1 },
      turnKind: "LEGAL" as never,
      capability: "CITIZEN" as never,
    }));

    const result = await researchMatterForActor(
      owner,
      "matter-1",
      "Энэ хэрэгт нэхэмжлэгчийн шаардлага үндэслэлтэй юу?",
      { matterRepository, createTurn },
    );

    expect(result.conversationId).toBe("conv-1");
    expect(result.content).toBe("Судалгааны дүгнэлт...");
    expect(createTurn).toHaveBeenCalledTimes(1);
    const callArg = createTurn.mock.calls[0]![0];
    expect(callArg).toEqual({
      userId: "user-1",
      actorRole: UserRole.CLIENT,
      matterId: "matter-1",
      message: "Энэ хэрэгт нэхэмжлэгчийн шаардлага үндэслэлтэй юу?",
      researchMode: true,
      userContext: { role: UserRole.CLIENT },
    });
  });

  it("refuses a non-owner with ForbiddenError and never calls createTurn", async () => {
    const matterRepository = fakeMatterRepository([baseMatter("matter-1", owner.userId)]);
    const createTurn = vi.fn<ResearchMatterDeps["createTurn"]>();

    await expect(
      researchMatterForActor(attacker, "matter-1", "Асуулт?", { matterRepository, createTurn }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(createTurn).not.toHaveBeenCalled();
  });

  it("returns NotFoundError for a nonexistent Matter and never calls createTurn", async () => {
    const matterRepository = fakeMatterRepository([]);
    const createTurn = vi.fn<ResearchMatterDeps["createTurn"]>();

    await expect(
      researchMatterForActor(owner, "matter-does-not-exist", "Асуулт?", {
        matterRepository,
        createTurn,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(createTurn).not.toHaveBeenCalled();
  });

  it("rejects an empty or blank question before any ownership check runs its side effects", async () => {
    const matterRepository = fakeMatterRepository([baseMatter("matter-1", owner.userId)]);
    const createTurn = vi.fn<ResearchMatterDeps["createTurn"]>();

    await expect(
      researchMatterForActor(owner, "matter-1", "   ", { matterRepository, createTurn }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(createTurn).not.toHaveBeenCalled();
  });

  it("passes only the verified matterId and the actor's own identity to createTurn -- no client-suppliable corpus/authority scope exists in its input shape (research test 12)", async () => {
    const matterRepository = fakeMatterRepository([baseMatter("matter-1", owner.userId)]);
    const createTurn = vi.fn<ResearchMatterDeps["createTurn"]>(async () => ({
      conversationId: "conv-1",
      message: { id: "msg-1", role: "ASSISTANT" as const, content: "...", citations: [] },
      usage: { inputTokens: 1, outputTokens: 1 },
      turnKind: "LEGAL" as never,
      capability: "CITIZEN" as never,
    }));

    await researchMatterForActor(owner, "matter-1", "Асуулт?", { matterRepository, createTurn });

    const callArg = createTurn.mock.calls[0]![0] as Record<string, unknown>;
    // Exactly the fields the use case is documented to pass -- no scope,
    // authority, corpus, or ownerId field can sneak in from caller input,
    // because researchMatterForActor's own signature has no such parameter.
    expect(Object.keys(callArg).sort()).toEqual(
      ["actorRole", "matterId", "message", "researchMode", "userContext", "userId"].sort(),
    );
    expect(callArg.matterId).toBe("matter-1");
    expect(callArg.userId).toBe(owner.userId);
  });
});
