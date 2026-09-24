import type { ActorContext } from "@/application/common/actor-context";
import { UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import type {
  AdminPaymentRepository,
  AdminSubscriptionListFilters,
  AdminSubscriptionListResult,
} from "@/domain/repositories/admin-payment-repository";

export const ADMIN_SUBSCRIPTION_LIST_PAGE_SIZE = 25;

export async function listAdminSubscriptionsUseCase(
  actor: ActorContext,
  input: AdminSubscriptionListFilters & { page: number },
  deps: { adminPaymentRepository: AdminPaymentRepository },
): Promise<AdminSubscriptionListResult> {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }
  const limit = ADMIN_SUBSCRIPTION_LIST_PAGE_SIZE;
  const offset = (Math.max(1, input.page) - 1) * limit;
  return deps.adminPaymentRepository.listSubscriptions({
    status: input.status,
    planCode: input.planCode,
    userSearch: input.userSearch,
    limit,
    offset,
  });
}
