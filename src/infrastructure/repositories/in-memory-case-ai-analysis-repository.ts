import { randomUUID } from "node:crypto";

import type { CaseAiAnalysisResult } from "@/domain/entities/case-ai-analysis";
import type {
  CaseAiAnalysisRepository,
  CreateCaseAiAnalysisInput,
} from "@/domain/repositories/case-ai-analysis-repository";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryCaseAiAnalysisRepository implements CaseAiAnalysisRepository {
  private readonly rows: CaseAiAnalysisResult[] = [];

  clear(): void {
    this.rows.length = 0;
  }

  async create(
    input: CreateCaseAiAnalysisInput,
  ): Promise<CaseAiAnalysisResult> {
    const record: CaseAiAnalysisResult =
      input.status === "OK"
        ? {
            id: randomUUID(),
            caseFileId: input.caseFileId,
            status: "OK",
            sections: clone(input.sections),
            citations: clone(input.citations),
            provider: input.provider,
            model: input.model,
            failureReason: null,
            createdByUserId: input.createdByUserId,
            createdAt: new Date(),
          }
        : {
            id: randomUUID(),
            caseFileId: input.caseFileId,
            status: "FAILED",
            sections: null,
            citations: [],
            provider: null,
            model: null,
            failureReason: input.failureReason,
            createdByUserId: input.createdByUserId,
            createdAt: new Date(),
          };
    this.rows.push(record);
    return clone(record);
  }

  async findLatestByCaseFileId(
    caseFileId: string,
  ): Promise<CaseAiAnalysisResult | null> {
    const matches = this.rows
      .filter((row) => row.caseFileId === caseFileId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return matches[0] ? clone(matches[0]) : null;
  }

  async listByCaseFileId(caseFileId: string): Promise<CaseAiAnalysisResult[]> {
    return this.rows
      .filter((row) => row.caseFileId === caseFileId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((row) => clone(row));
  }
}
