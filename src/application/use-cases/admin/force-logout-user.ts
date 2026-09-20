import type { ActorContext } from "@/application/common/actor-context";
import {
  generateActiveSessionId,
  hashActiveSessionId,
} from "@/domain/services/active-session";
import { AuditAction, UserRole } from "@/domain/enums";
import { ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors/domain-error";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";

export type ForceLogoutUserDeps = {
  userRepository: UserRepository;
  auditLogRepository: AuditLogRepository;
};

/**
 * Invalidates the target's current session by rotating their bound session
 * hash to one derived from a fresh, unrelated session id — the same
 * mechanism password-reset already uses to force re-authentication
 * (see application/use-cases/auth/password-reset.ts). Their JWT's `sid`
 * can no longer match, so their next request resolves to "replaced" and
 * they are signed out. This does not lock the account — they can sign in
 * again immediately.
 */
export async function forceLogoutUserUseCase(
  actor: ActorContext,
  input: { userId: string },
  deps: ForceLogoutUserDeps,
  ipAddress?: string,
): Promise<void> {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }

  if (input.userId === actor.userId) {
    throw new ValidationError("You cannot force logout your own session");
  }

  const target = await deps.userRepository.findById(input.userId);
  if (!target) {
    throw new NotFoundError("User", input.userId);
  }

  await deps.userRepository.rotateActiveSessionIdHash(
    input.userId,
    hashActiveSessionId(generateActiveSessionId()),
  );

  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action: AuditAction.UPDATE,
    entityType: "User",
    entityId: input.userId,
    metadata: { action: "force_logout" },
    ipAddress,
  });
}
