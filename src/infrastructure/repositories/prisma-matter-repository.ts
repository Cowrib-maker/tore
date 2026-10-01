import type { Prisma } from "@/generated/prisma/client";
import type {
  CreateMatterInput,
  Matter,
  MatterStatus,
  MatterType,
} from "@/domain/entities/matter";
import type {
  MatterRepository,
  UpdateMatterPatch,
} from "@/domain/repositories/matter-repository";
import { getPrismaClient } from "@/infrastructure/database/prisma-client";

type MatterRow = Prisma.MatterGetPayload<Record<string, never>>;

function mapMatter(row: MatterRow): Matter {
  return {
    id: row.id,
    ownerId: row.ownerId,
    title: row.title,
    type: row.type as MatterType,
    description: row.description,
    status: row.status as MatterStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaMatterRepository implements MatterRepository {
  async create(input: CreateMatterInput): Promise<Matter> {
    const db = getPrismaClient();
    const created = await db.matter.create({
      data: {
        ownerId: input.ownerId,
        title: input.title,
        type: input.type,
        description: input.description,
      },
    });
    return mapMatter(created);
  }

  async findById(id: string): Promise<Matter | null> {
    const db = getPrismaClient();
    const row = await db.matter.findUnique({ where: { id } });
    return row ? mapMatter(row) : null;
  }

  async update(id: string, patch: UpdateMatterPatch): Promise<Matter> {
    const db = getPrismaClient();
    const updated = await db.matter.update({
      where: { id },
      data: {
        title: patch.title,
        type: patch.type,
        description: patch.description,
        status: patch.status,
      },
    });
    return mapMatter(updated);
  }

  async listByOwnerId(ownerId: string): Promise<Matter[]> {
    const db = getPrismaClient();
    const rows = await db.matter.findMany({
      where: { ownerId },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(mapMatter);
  }

  async countConversationsByMatterIds(
    matterIds: string[],
  ): Promise<Record<string, number>> {
    if (matterIds.length === 0) return {};
    const db = getPrismaClient();
    const grouped = await db.aIConversation.groupBy({
      by: ["matterId"],
      where: { matterId: { in: matterIds } },
      _count: { _all: true },
    });
    const result: Record<string, number> = {};
    for (const group of grouped) {
      if (group.matterId) {
        result[group.matterId] = group._count._all;
      }
    }
    return result;
  }
}

export const matterRepository = new PrismaMatterRepository();
