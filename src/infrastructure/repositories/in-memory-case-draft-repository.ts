import { randomUUID } from "node:crypto";

import type { CaseDraftResult } from "@/domain/entities/case-draft";
import type {
  CaseDraftRepository,
  CreateCaseDraftInput,
} from "@/domain/repositories/case-draft-repository";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryCaseDraftRepository implements CaseDraftRepository {
  private readonly rows: CaseDraftResult[] = [];

  clear(): void {
    this.rows.length = 0;
  }

  async create(input: CreateCaseDraftInput): Promise<CaseDraftResult> {
    const record: CaseDraftResult =
      input.status === "OK"
        ? {
            id: randomUUID(),
            caseFileId: input.caseFileId,
            draftType: input.draftType,
            status: "OK",
            content: clone(input.content),
            failureReason: null,
            createdByUserId: input.createdByUserId,
            createdAt: new Date(),
          }
        : {
            id: randomUUID(),
            caseFileId: input.caseFileId,
            draftType: input.draftType,
            status: "FAILED",
            content: null,
            failureReason: input.failureReason,
            createdByUserId: input.createdByUserId,
            createdAt: new Date(),
          };
    this.rows.push(record);
    return clone(record);
  }

  async listByCaseFileId(caseFileId: string): Promise<CaseDraftResult[]> {
    return this.rows
      .filter((row) => row.caseFileId === caseFileId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((row) => clone(row));
  }
}
