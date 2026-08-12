import { cache } from "react";

import type { ActorContext } from "@/application/common/actor-context";
import { getSessionUser } from "@/application/common/session";
import { UserRole, UserStatus } from "@/domain/enums";
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/domain/errors/domain-error";
import { userRepository } from "@/infrastructure/repositories";

const ROLE_VALUES = new Set<string>(Object.values(UserRole));

/**
 * Require an authenticated ACTIVE principal.
 * Authorization trusts the current database role/status (not only JWT claims).
 */
export async function requireActor(role?: UserRole): Promise<ActorContext> {
  const session = await getSessionUser();
  if (!session?.user?.id) {
    throw new UnauthorizedError("You must be signed in");
  }

  const record = await loadActorUser(session.user.id);
  if (!record || record.status !== UserStatus.ACTIVE) {
    throw new UnauthorizedError("You must be signed in");
  }

  if (!ROLE_VALUES.has(record.role)) {
    throw new ForbiddenError();
  }

  if (role !== undefined && record.role !== role) {
    throw new ForbiddenError();
  }

  return { userId: record.id, role: record.role };
}

const loadActorUser = cache(async (userId: string) => {
  return userRepository.findById(userId);
});
