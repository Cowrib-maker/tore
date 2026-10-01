import type { ActorContext } from "@/application/common/actor-context";
import type { Matter } from "@/domain/entities/matter";
import type { MatterRepository } from "@/domain/repositories/matter-repository";
import { matterRepository } from "@/infrastructure/repositories";

export type MatterListItem = Matter & { conversationCount: number };

/**
 * The user's own Matters only (repository query is scoped to ownerId — no
 * cross-user listing is possible). Conversation counts come from one
 * grouped aggregate query, never by loading conversations/messages.
 */
export async function listMattersForActor(
  actor: ActorContext,
  repository: MatterRepository = matterRepository,
): Promise<MatterListItem[]> {
  const matters = await repository.listByOwnerId(actor.userId);
  const counts = await repository.countConversationsByMatterIds(
    matters.map((matter) => matter.id),
  );
  return matters.map((matter) => ({
    ...matter,
    conversationCount: counts[matter.id] ?? 0,
  }));
}
