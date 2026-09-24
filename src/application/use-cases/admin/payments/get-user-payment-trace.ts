import type { ActorContext } from "@/application/common/actor-context";
import { UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import type {
  AdminPaymentRepository,
  UserPaymentTrace,
} from "@/domain/repositories/admin-payment-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";

export type GetUserPaymentTraceDeps = {
  adminPaymentRepository: AdminPaymentRepository;
  userRepository: UserRepository;
};

/**
 * Answers "why does this user have this paid entitlement?" — accepts
 * either a userId or an email address so an admin can start from
 * whichever identifier they have on hand (e.g. from a support ticket).
 */
export async function getAdminUserPaymentTraceUseCase(
  actor: ActorContext,
  identifier: string,
  deps: GetUserPaymentTraceDeps,
): Promise<UserPaymentTrace | null> {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  const userId = trimmed.includes("@")
    ? (await deps.userRepository.findByEmail(trimmed))?.id
    : trimmed;
  if (!userId) return null;

  return deps.adminPaymentRepository.getUserPaymentTrace(userId);
}
