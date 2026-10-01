import type { ActorContext } from "@/application/common/actor-context";
import type { MatterRepository } from "@/domain/repositories/matter-repository";
import { matterRepository } from "@/infrastructure/repositories";

import { requireOwnedMatter } from "./assert-access";

/**
 * Server-side gate for attaching an AI conversation to a Matter — called
 * from /api/ai/chat before any matterId from the client is trusted. Unlike
 * assertOwnedCaseFileForAi this has no LAWYER-only restriction: Matter is a
 * generic, any-role container. The actual conversation-creation write
 * (with matterId persisted) happens lazily inside legal-ai.service.ts's
 * resolveConversation, exactly like every other new conversation — opening
 * a Matter's AI page creates nothing and consumes no entitlement until the
 * user's first message actually reaches that path.
 */
export async function assertOwnedMatterForAi(
  actor: ActorContext,
  matterId: string,
  repository: MatterRepository = matterRepository,
): Promise<void> {
  await requireOwnedMatter(actor, matterId, repository);
}
