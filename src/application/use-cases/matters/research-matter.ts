import type { LegalAiSafeCitation } from "@/application/ai/legal-ai-citation";
import { getLegalAiService } from "@/application/ai/create-legal-ai-service";
import type { ActorContext } from "@/application/common/actor-context";
import type { MatterRepository } from "@/domain/repositories/matter-repository";
import { ValidationError } from "@/domain/errors/domain-error";
import { matterRepository } from "@/infrastructure/repositories";

import { requireOwnedMatter } from "./assert-access";

const QUESTION_MAX_LENGTH = 2000;

export type ResearchMatterResult = {
  conversationId: string;
  content: string;
  citations: LegalAiSafeCitation[];
};

export type ResearchMatterDeps = {
  matterRepository: MatterRepository;
  createTurn: (
    input: Parameters<ReturnType<typeof getLegalAiService>["createTurn"]>[0],
  ) => ReturnType<ReturnType<typeof getLegalAiService>["createTurn"]>;
};

function defaultResearchMatterDeps(): ResearchMatterDeps {
  const service = getLegalAiService();
  return {
    matterRepository,
    createTurn: (input) => service.createTurn(input),
  };
}

/**
 * TORE Matter Legal Research V1 — a Matter-scoped, grounded legal research
 * question. Ownership is verified before anything else; the question is
 * then routed through the EXACT same LegalAiService.createTurn pipeline
 * every other Legal AI turn uses (entitlement reservation/consumption,
 * MatterDocument + conversation document context, TORE corpus retrieval,
 * citation persistence) with `researchMode: true`, which makes
 * completeMatterResearch (legal-ai.service.ts) produce the fixed 5-section
 * research structure instead of the normal chat output. Always starts a
 * fresh conversation (no conversationId) — Research is a one-shot action,
 * not a continuation of an existing chat thread.
 */
export async function researchMatterForActor(
  actor: ActorContext,
  matterId: string,
  question: string,
  deps: ResearchMatterDeps = defaultResearchMatterDeps(),
): Promise<ResearchMatterResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    throw new ValidationError("Судалгааны асуултаа бичнэ үү.");
  }
  if (trimmed.length > QUESTION_MAX_LENGTH) {
    throw new ValidationError(
      `Судалгааны асуулт ${QUESTION_MAX_LENGTH} тэмдэгтээс хэтрэхгүй байх ёстой.`,
    );
  }

  await requireOwnedMatter(actor, matterId, deps.matterRepository);

  const result = await deps.createTurn({
    userId: actor.userId,
    actorRole: actor.role,
    matterId,
    message: trimmed,
    researchMode: true,
    userContext: { role: actor.role },
  });

  return {
    conversationId: result.conversationId,
    content: result.message.content,
    citations: result.message.citations ?? [],
  };
}
