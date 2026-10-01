import type { ActorContext } from "@/application/common/actor-context";
import type { MatterDocument } from "@/domain/entities/matter-document";
import type { MatterDocumentRepository } from "@/domain/repositories/matter-document-repository";
import type { MatterRepository } from "@/domain/repositories/matter-repository";
import {
  matterDocumentRepository,
  matterRepository,
} from "@/infrastructure/repositories";

import { requireOwnedMatter } from "./assert-access";

/**
 * Every MatterDocument read goes through requireOwnedMatter first — a
 * document list is never fetched by matterId alone.
 */
export async function listMatterDocumentsForActor(
  actor: ActorContext,
  matterId: string,
  repository: MatterRepository = matterRepository,
  documentRepository: MatterDocumentRepository = matterDocumentRepository,
): Promise<MatterDocument[]> {
  await requireOwnedMatter(actor, matterId, repository);
  return documentRepository.listByMatterId(matterId);
}
