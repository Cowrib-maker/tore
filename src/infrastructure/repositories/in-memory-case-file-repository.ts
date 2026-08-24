import { randomUUID } from "node:crypto";

import type {
  CaseFile,
  CaseFilePatch,
  CreateCaseFileInput,
} from "@/domain/entities/case-file";
import type { CaseFileRepository } from "@/domain/repositories/case-file-repository";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryCaseFileRepository implements CaseFileRepository {
  private readonly rows = new Map<string, CaseFile>();

  clear(): void {
    this.rows.clear();
  }

  async create(input: CreateCaseFileInput): Promise<CaseFile> {
    const now = new Date();
    const id = randomUUID();
    const record: CaseFile = {
      id,
      ownerLawyerId: input.ownerLawyerId,
      title: input.title,
      description: input.description,
      legalDomain: input.legalDomain,
      version: 1,
      applicableAt: input.applicableAt,
      request: clone(input.request),
      review: input.review ? clone(input.review) : null,
      mappingLog: clone(input.mappingLog ?? []),
      fixtureRules: input.fixtureRules ? clone(input.fixtureRules) : null,
      analysisStatus: input.analysisStatus ?? "NOT_ANALYZED",
      lastAnalyzedAt: input.lastAnalyzedAt ?? null,
      lastAnalysisError: input.lastAnalysisError ?? null,
      facts: clone(input.facts ?? []).map((fact) => ({
        ...fact,
        caseFileId: id,
      })),
      evidence: clone(input.evidence ?? []).map((item) => ({
        ...item,
        caseFileId: id,
      })),
      factEvidenceLinks: clone(input.factEvidenceLinks ?? []),
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(record.id, record);
    return clone(record);
  }

  async findById(id: string): Promise<CaseFile | null> {
    const record = this.rows.get(id);
    return record ? clone(record) : null;
  }

  async listByOwnerLawyerId(ownerLawyerId: string): Promise<CaseFile[]> {
    return [...this.rows.values()]
      .filter((row) => row.ownerLawyerId === ownerLawyerId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((row) => clone(row));
  }

  async findOwnedEvidenceByFileReference(
    ownerLawyerId: string,
    fileReference: string,
  ): Promise<{ id: string; caseFileId: string } | null> {
    for (const file of this.rows.values()) {
      if (file.ownerLawyerId !== ownerLawyerId) continue;
      const evidence = file.evidence.find(
        (item) => item.fileReference === fileReference,
      );
      if (evidence) {
        return { id: evidence.id, caseFileId: file.id };
      }
    }
    return null;
  }

  async updateIfVersionMatch(
    id: string,
    expectedVersion: number,
    patch: CaseFilePatch,
  ): Promise<CaseFile | null> {
    const current = this.rows.get(id);
    if (!current || current.version !== expectedVersion) {
      return null;
    }
    const next: CaseFile = {
      ...current,
      title: patch.title ?? current.title,
      description:
        patch.description !== undefined ? patch.description : current.description,
      legalDomain: patch.legalDomain ?? current.legalDomain,
      applicableAt: patch.applicableAt ?? current.applicableAt,
      request: patch.request ? clone(patch.request) : current.request,
      review: patch.review !== undefined ? clone(patch.review) : current.review,
      mappingLog: patch.mappingLog ? clone(patch.mappingLog) : current.mappingLog,
      fixtureRules:
        patch.fixtureRules !== undefined
          ? clone(patch.fixtureRules)
          : current.fixtureRules,
      analysisStatus: patch.analysisStatus ?? current.analysisStatus,
      lastAnalyzedAt:
        patch.lastAnalyzedAt !== undefined
          ? patch.lastAnalyzedAt
          : current.lastAnalyzedAt,
      lastAnalysisError:
        patch.lastAnalysisError !== undefined
          ? patch.lastAnalysisError
          : current.lastAnalysisError,
      facts: patch.facts ? clone(patch.facts) : current.facts,
      evidence: patch.evidence ? clone(patch.evidence) : current.evidence,
      factEvidenceLinks: patch.factEvidenceLinks
        ? clone(patch.factEvidenceLinks)
        : current.factEvidenceLinks,
      version: current.version + 1,
      updatedAt: new Date(),
    };
    this.rows.set(id, next);
    return clone(next);
  }
}
