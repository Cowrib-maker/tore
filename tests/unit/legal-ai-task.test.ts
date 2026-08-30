import { describe, expect, it } from "vitest";

import { LegalAiCapability } from "@/application/ai/legal-ai-capability";
import {
  LegalAiReasoningStage,
  LegalAiTaskType,
  classifyLegalAiTask,
  taskRequiresLegalRetrieval,
} from "@/application/ai/legal-ai-task";
import { IntentType } from "@/engine/intent";

describe("legal AI task retrieval", () => {
  it("requires official-source retrieval for issue spotting, summaries, and evidence", () => {
    expect(taskRequiresLegalRetrieval(LegalAiTaskType.ISSUE_SPOTTING)).toBe(
      true,
    );
    expect(taskRequiresLegalRetrieval(LegalAiTaskType.CASE_SUMMARY)).toBe(true);
    expect(taskRequiresLegalRetrieval(LegalAiTaskType.EVIDENCE_ANALYSIS)).toBe(
      true,
    );
    expect(taskRequiresLegalRetrieval(LegalAiTaskType.GENERAL_LEGAL)).toBe(
      true,
    );
  });

  it("classifies issue spotting without dropping legal retrieval", () => {
    const task = classifyLegalAiTask({
      capability: LegalAiCapability.LAWYER,
      intent: IntentType.LEGAL_RESEARCH,
      hasCaseContext: true,
      hasDocument: false,
      message: "Энэ хэргийн ямар асуудал байна?",
    });
    expect(task).toBe(LegalAiTaskType.ISSUE_SPOTTING);
    expect(taskRequiresLegalRetrieval(task)).toBe(true);
  });

  it("keeps LEGAL_RETRIEVAL in the issue-spotting stage list", () => {
    expect(
      taskRequiresLegalRetrieval(LegalAiTaskType.ISSUE_SPOTTING),
    ).toBe(true);
    expect(LegalAiReasoningStage.LEGAL_RETRIEVAL).toBe("LEGAL_RETRIEVAL");
  });
});
