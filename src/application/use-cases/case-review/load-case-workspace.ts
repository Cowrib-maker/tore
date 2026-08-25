import type { ActorContext } from "@/application/common/actor-context";
import { ValidationError } from "@/domain/errors/domain-error";
import type { CaseReviewWorkspacePayload } from "@/engine/doctrine";

import { requireOwnedCaseFile } from "./assert-access";
import {
  deriveCaseActivity,
  toCaseDocumentViews,
  type CaseActivityItem,
  type CaseDocumentView,
} from "./case-activity";
import {
  defaultCaseAiDeps,
  listCaseConversationsForLawyer,
  type CaseAiDeps,
  type CaseConversationSummary,
} from "./case-conversations";
import { isCaseAnalysisRequest } from "./view-model";
import { toWorkspacePayload } from "./payload";

export type CaseWorkspaceView = {
  payload: CaseReviewWorkspacePayload;
  createdAt: string;
  conversations: CaseConversationSummary[];
  documents: CaseDocumentView[];
  activity: CaseActivityItem[];
};

export async function loadCaseWorkspaceForLawyer(
  actor: ActorContext,
  caseId: string,
  deps: CaseAiDeps = defaultCaseAiDeps(),
): Promise<CaseWorkspaceView> {
  const file = await requireOwnedCaseFile(actor, caseId, deps.repository);
  if (!isCaseAnalysisRequest(file.request)) {
    throw new ValidationError("Шинжилгээний хүсэлт буруу бүтэцтэй байна.");
  }
  const conversations = await listCaseConversationsForLawyer(actor, caseId, deps);
  return {
    payload: toWorkspacePayload(file),
    createdAt: file.createdAt.toISOString(),
    conversations,
    documents: toCaseDocumentViews(file),
    activity: deriveCaseActivity(file, conversations),
  };
}
