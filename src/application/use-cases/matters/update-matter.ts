import type { ActorContext } from "@/application/common/actor-context";
import type { Matter } from "@/domain/entities/matter";
import type { MatterRepository } from "@/domain/repositories/matter-repository";
import { ValidationError } from "@/domain/errors/domain-error";
import { matterRepository } from "@/infrastructure/repositories";

import { requireOwnedMatter } from "./assert-access";

const TITLE_MAX_LENGTH = 200;

export type UpdateMatterForActorInput = {
  title?: string;
  description?: string | null;
  status?: "ACTIVE" | "ARCHIVED";
};

/**
 * No UI wires this in V1 (Overview is read-only) — it exists so the
 * ownership boundary is enforced and tested from day one, ahead of the
 * archive/rename affordances a future pass will add to the Overview page.
 */
export async function updateMatterForActor(
  actor: ActorContext,
  matterId: string,
  input: UpdateMatterForActorInput,
  repository: MatterRepository = matterRepository,
): Promise<Matter> {
  await requireOwnedMatter(actor, matterId, repository);

  const patch: { title?: string; description?: string | null; status?: "ACTIVE" | "ARCHIVED" } = {};
  if (input.title !== undefined) {
    const trimmed = input.title.trim();
    if (!trimmed) {
      throw new ValidationError("Хэргийн нэрийг оруулна уу.");
    }
    if (trimmed.length > TITLE_MAX_LENGTH) {
      throw new ValidationError(
        `Хэргийн нэр ${TITLE_MAX_LENGTH} тэмдэгтээс хэтрэхгүй байх ёстой.`,
      );
    }
    patch.title = trimmed;
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }
  if (input.status !== undefined) {
    patch.status = input.status;
  }

  return repository.update(matterId, patch);
}
