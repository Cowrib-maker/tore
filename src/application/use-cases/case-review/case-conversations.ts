import type { ActorContext } from "@/application/common/actor-context";
import type { LegalAiStore } from "@/application/ai/legal-ai.types";
import type { CaseFileRepository } from "@/domain/repositories/case-file-repository";
import { ForbiddenError } from "@/domain/errors/domain-error";
import { UserRole } from "@/domain/enums";

import { requireOwnedCaseFile } from "./assert-access";
import { defaultCaseFileDeps } from "./deps";
import { productionCaseAiDeps } from "./prod-wiring";

export type CaseConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type CaseAiDeps = {
  repository: CaseFileRepository;
  store: LegalAiStore;
};

export function defaultCaseAiDeps(): CaseAiDeps {
  return productionCaseAiDeps();
}

export async function assertOwnedCaseFileForAi(
  actor: ActorContext,
  caseFileId: string,
  repository: CaseFileRepository = defaultCaseFileDeps().repository,
): Promise<void> {
  if (actor.role !== UserRole.LAWYER) {
    throw new ForbiddenError("Зөвхөн өмгөөлөгч AI яриаг хэрэгтэй холбож болно.");
  }
  await requireOwnedCaseFile(actor, caseFileId, repository);
}

export async function listCaseConversationsForLawyer(
  actor: ActorContext,
  caseId: string,
  deps: CaseAiDeps = defaultCaseAiDeps(),
): Promise<CaseConversationSummary[]> {
  await requireOwnedCaseFile(actor, caseId, deps.repository);
  const rows = await deps.store.listOwnedCaseConversations(actor.userId, caseId);
  return rows.map((row) => ({
    id: row.id,
    title: row.title?.trim() || "Шинэ яриа",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function startCaseConversationForLawyer(
  actor: ActorContext,
  caseId: string,
  deps: CaseAiDeps = defaultCaseAiDeps(),
): Promise<{ conversationId: string; caseId: string }> {
  const file = await requireOwnedCaseFile(actor, caseId, deps.repository);
  const conversation = await deps.store.createConversation({
    userId: actor.userId,
    title: file.title.slice(0, 80),
    caseFileId: file.id,
  });
  return { conversationId: conversation.id, caseId: file.id };
}
