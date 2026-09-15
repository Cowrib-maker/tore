import { Prisma } from "@/generated/prisma/client";
import { CaseDraftStatus, type CaseDraftResult } from "@/domain/entities/case-draft";
import type {
  CaseDraftRepository,
  CreateCaseDraftInput,
} from "@/domain/repositories/case-draft-repository";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function mapRow(row: {
  id: string;
  caseFileId: string;
  draftType: string;
  status: string;
  content: Prisma.JsonValue;
  failureReason: string | null;
  createdByUserId: string;
  createdAt: Date;
}): CaseDraftResult {
  return {
    id: row.id,
    caseFileId: row.caseFileId,
    draftType: row.draftType as CaseDraftResult["draftType"],
    status: row.status as CaseDraftResult["status"],
    content:
      row.content != null
        ? (row.content as unknown as CaseDraftResult["content"])
        : null,
    failureReason: row.failureReason,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
  };
}

export class PrismaCaseDraftRepository implements CaseDraftRepository {
  constructor(private readonly client?: PrismaDbClient) {}

  async create(input: CreateCaseDraftInput): Promise<CaseDraftResult> {
    const db = getPrismaClient(this.client);
    const row = await db.caseDraft.create({
      data:
        input.status === "OK"
          ? {
              caseFileId: input.caseFileId,
              draftType: input.draftType,
              createdByUserId: input.createdByUserId,
              status: CaseDraftStatus.OK,
              content: asJson(input.content),
            }
          : {
              caseFileId: input.caseFileId,
              draftType: input.draftType,
              createdByUserId: input.createdByUserId,
              status: CaseDraftStatus.FAILED,
              failureReason: input.failureReason,
            },
    });
    return mapRow(row);
  }

  async listByCaseFileId(caseFileId: string): Promise<CaseDraftResult[]> {
    const db = getPrismaClient(this.client);
    const rows = await db.caseDraft.findMany({
      where: { caseFileId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapRow);
  }
}

export const caseDraftRepository = new PrismaCaseDraftRepository();
