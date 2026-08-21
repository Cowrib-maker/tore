import type { ActorContext } from "@/application/common/actor-context";
import type { User } from "@/domain/entities/user";
import { AuditAction, UserRole, UserStatus } from "@/domain/enums";
import { ForbiddenError, ValidationError } from "@/domain/errors/domain-error";
import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type {
  ListUsersInput,
  ListUsersResult,
  UserRepository,
} from "@/domain/repositories/user-repository";

export type ManageUsersDeps = {
  userRepository: UserRepository;
  auditLogRepository: AuditLogRepository;
};

function assertAdmin(actor: ActorContext) {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }
}

export async function listUsersUseCase(
  actor: ActorContext,
  input: ListUsersInput,
  deps: Pick<ManageUsersDeps, "userRepository">,
): Promise<ListUsersResult> {
  assertAdmin(actor);
  return deps.userRepository.listUsers(input);
}

export async function setUserStatusUseCase(
  actor: ActorContext,
  input: { userId: string; status: UserStatus },
  deps: ManageUsersDeps,
  ipAddress?: string,
): Promise<User> {
  assertAdmin(actor);

  if (input.userId === actor.userId) {
    throw new ValidationError("You cannot change your own account status");
  }

  const updated = await deps.userRepository.updateStatus(
    input.userId,
    input.status,
  );

  await deps.auditLogRepository.create({
    actorUserId: actor.userId,
    action:
      input.status === UserStatus.SUSPENDED
        ? AuditAction.SUSPEND
        : AuditAction.UPDATE,
    entityType: "User",
    entityId: input.userId,
    metadata: { status: input.status },
    ipAddress,
  });

  return updated;
}
