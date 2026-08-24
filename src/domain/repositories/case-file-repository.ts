import type {
  CaseFile,
  CaseFilePatch,
  CreateCaseFileInput,
} from "@/domain/entities/case-file";

export interface CaseFileRepository {
  create(input: CreateCaseFileInput): Promise<CaseFile>;
  findById(id: string): Promise<CaseFile | null>;
  listByOwnerLawyerId(ownerLawyerId: string): Promise<CaseFile[]>;
  findOwnedEvidenceByFileReference(
    ownerLawyerId: string,
    fileReference: string,
  ): Promise<{ id: string; caseFileId: string } | null>;
  /**
   * Optimistic concurrency: updates only when `version` matches.
   * Returns null when the row is missing or the version is stale.
   */
  updateIfVersionMatch(
    id: string,
    expectedVersion: number,
    patch: CaseFilePatch,
  ): Promise<CaseFile | null>;
}
