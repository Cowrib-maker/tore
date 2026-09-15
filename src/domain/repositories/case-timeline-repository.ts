import type {
  CaseTimelineEntry,
  CreateCaseTimelineEntryInput,
} from "@/domain/entities/case-timeline";

export interface CaseTimelineRepository {
  /**
   * Replaces every timeline entry for the case with a freshly extracted
   * set — extraction is a deterministic pure function of the case's
   * current evidence, so re-running it is idempotent-by-replacement rather
   * than accumulating duplicate rows on every re-run.
   */
  replaceForCaseFile(
    caseFileId: string,
    entries: CreateCaseTimelineEntryInput[],
  ): Promise<CaseTimelineEntry[]>;
  listByCaseFileId(caseFileId: string): Promise<CaseTimelineEntry[]>;
}
