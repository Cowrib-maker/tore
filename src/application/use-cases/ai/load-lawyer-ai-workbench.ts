import type { ActorContext } from "@/application/common/actor-context";
import { UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";

import {
  defaultCaseAiDeps,
  type CaseAiDeps,
} from "@/application/use-cases/case-review/case-conversations";
import { requireOwnedCaseFile } from "@/application/use-cases/case-review/assert-access";
import { analysisStatusLabelMn } from "@/application/use-cases/case-review/labels";
import { displayCaseStatus } from "@/application/use-cases/case-review/payload";

export type LawyerAiHistoryItem = {
  id: string;
  title: string;
  caseTitle: string | null;
  updatedAt: string;
};

export type LawyerAiCaseContext = {
  caseId: string;
  title: string;
  documentCount: number;
  conversationCount: number;
  analysisStatus: string;
  analysisStatusLabel: string;
  documents: Array<{ id: string; title: string }>;
};

export type LawyerAiWorkbenchView = {
  conversationId?: string;
  caseFileId?: string;
  caseContext: LawyerAiCaseContext | null;
  history: LawyerAiHistoryItem[];
};

const HISTORY_LIMIT = 30;

export async function loadLawyerAiWorkbench(
  actor: ActorContext,
  input: { conversationId?: string; caseId?: string },
  deps: CaseAiDeps = defaultCaseAiDeps(),
): Promise<LawyerAiWorkbenchView> {
  if (actor.role !== UserRole.LAWYER) {
    throw new ForbiddenError("Only licensed lawyers may open this workbench.");
  }

  const [historyRows, ownedCases] = await Promise.all([
    deps.store.listOwnedRecentConversations(actor.userId, HISTORY_LIMIT),
    deps.repository.listByOwnerLawyerId(actor.userId),
  ]);
  const caseTitleById = new Map(ownedCases.map((file) => [file.id, file.title]));

  let ownedConversationId: string | undefined;
  let caseFileId: string | undefined;

  if (input.conversationId) {
    const owned = await deps.store.findOwnedConversation(
      input.conversationId,
      actor.userId,
    );
    if (owned) {
      ownedConversationId = owned.id;
      if (owned.caseFileId) {
        caseFileId = owned.caseFileId;
      }
    }
  }

  if (!caseFileId && input.caseId) {
    try {
      const file = await requireOwnedCaseFile(
        actor,
        input.caseId,
        deps.repository,
      );
      caseFileId = file.id;
    } catch {
      caseFileId = undefined;
    }
  }

  let caseContext: LawyerAiCaseContext | null = null;

  if (caseFileId) {
    try {
      const file = await requireOwnedCaseFile(
        actor,
        caseFileId,
        deps.repository,
      );
      const conversations = await deps.store.listOwnedCaseConversations(
        actor.userId,
        file.id,
      );
      const status = displayCaseStatus(file);
      caseContext = {
        caseId: file.id,
        title: file.title,
        documentCount: file.evidence.filter((item) => item.fileReference).length,
        conversationCount: conversations.length,
        analysisStatus: status,
        analysisStatusLabel: analysisStatusLabelMn(status),
        documents: file.evidence
          .filter((item) => item.fileReference)
          .map((item) => ({ id: item.id, title: item.title })),
      };
      caseFileId = file.id;
    } catch {
      caseContext = null;
      caseFileId = undefined;
    }
  }

  const history: LawyerAiHistoryItem[] = historyRows.map((row) => ({
    id: row.id,
    title: row.title?.trim() || "Шинэ яриа",
    caseTitle: row.caseFileId
      ? (caseTitleById.get(row.caseFileId) ?? null)
      : null,
    updatedAt: row.updatedAt.toISOString(),
  }));

  return {
    conversationId: ownedConversationId,
    caseFileId,
    caseContext,
    history,
  };
}
