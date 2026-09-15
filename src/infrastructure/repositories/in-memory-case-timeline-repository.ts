import { randomUUID } from "node:crypto";

import type {
  CaseTimelineEntry,
  CreateCaseTimelineEntryInput,
} from "@/domain/entities/case-timeline";
import type { CaseTimelineRepository } from "@/domain/repositories/case-timeline-repository";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryCaseTimelineRepository implements CaseTimelineRepository {
  private readonly rows: CaseTimelineEntry[] = [];

  clear(): void {
    this.rows.length = 0;
  }

  async replaceForCaseFile(
    caseFileId: string,
    entries: CreateCaseTimelineEntryInput[],
  ): Promise<CaseTimelineEntry[]> {
    for (let i = this.rows.length - 1; i >= 0; i -= 1) {
      if (this.rows[i]?.caseFileId === caseFileId) {
        this.rows.splice(i, 1);
      }
    }
    const now = new Date();
    const created = entries.map((entry) => ({
      ...entry,
      id: randomUUID(),
      createdAt: now,
    }));
    this.rows.push(...created);
    return this.listByCaseFileId(caseFileId);
  }

  async listByCaseFileId(caseFileId: string): Promise<CaseTimelineEntry[]> {
    return this.rows
      .filter((row) => row.caseFileId === caseFileId)
      .sort((a, b) => {
        const aTime = a.parsedDate?.getTime() ?? Number.POSITIVE_INFINITY;
        const bTime = b.parsedDate?.getTime() ?? Number.POSITIVE_INFINITY;
        if (aTime !== bTime) return aTime - bTime;
        return a.createdAt.getTime() - b.createdAt.getTime();
      })
      .map((row) => clone(row));
  }
}
