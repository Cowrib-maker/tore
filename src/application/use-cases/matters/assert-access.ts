import type { ActorContext } from "@/application/common/actor-context";
import type { Matter } from "@/domain/entities/matter";
import type { MatterRepository } from "@/domain/repositories/matter-repository";
import { ForbiddenError, NotFoundError } from "@/domain/errors/domain-error";

/**
 * Server-side ownership boundary for Matter — mirrors
 * case-review/assert-access.ts's requireOwnedCaseFile, but Matter is a
 * generic, any-role container (no LAWYER-only restriction). A missing
 * Matter and an unowned Matter both fail closed with the same shape of
 * error a caller would see for "not found", so a guessed id never
 * distinguishes "doesn't exist" from "exists but isn't yours".
 */
export async function requireOwnedMatter(
  actor: ActorContext,
  matterId: string,
  repository: MatterRepository,
): Promise<Matter> {
  const matter = await repository.findById(matterId);
  if (!matter) {
    throw new NotFoundError("Matter", matterId);
  }
  if (matter.ownerId !== actor.userId) {
    throw new ForbiddenError("Та энэ хэргийг харах эрхгүй.");
  }
  return matter;
}
