import type { ActorContext } from "@/application/common/actor-context";
import type { Matter } from "@/domain/entities/matter";
import type { MatterRepository } from "@/domain/repositories/matter-repository";
import { matterRepository } from "@/infrastructure/repositories";

import { requireOwnedMatter } from "./assert-access";

export type MatterOverview = Matter & { conversationCount: number };

/**
 * Ownership-checked read of one Matter plus its real conversation count.
 * Never loads conversation content/messages — the Overview page shows a
 * count only (see AGENTS section 21, "Performance").
 */
export async function loadMatterOverviewForActor(
  actor: ActorContext,
  matterId: string,
  repository: MatterRepository = matterRepository,
): Promise<MatterOverview> {
  const matter = await requireOwnedMatter(actor, matterId, repository);
  const counts = await repository.countConversationsByMatterIds([matter.id]);
  return { ...matter, conversationCount: counts[matter.id] ?? 0 };
}
