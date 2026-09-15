import type {
  CaseDraftResult,
  CaseDraftType,
  LawyerPositionDraftContent,
} from "@/domain/entities/case-draft";

export type CreateCaseDraftInput = {
  caseFileId: string;
  draftType: CaseDraftType;
  createdByUserId: string;
} & (
  | { status: "OK"; content: LawyerPositionDraftContent }
  | { status: "FAILED"; failureReason: string }
);

export interface CaseDraftRepository {
  create(input: CreateCaseDraftInput): Promise<CaseDraftResult>;
  listByCaseFileId(caseFileId: string): Promise<CaseDraftResult[]>;
}
