import type { ActorContext } from "@/application/common/actor-context";
import { UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import type {
  AdminEntitlementListFilters,
  AdminEntitlementListResult,
  AdminPaymentRepository,
} from "@/domain/repositories/admin-payment-repository";

export const ADMIN_ENTITLEMENT_LIST_PAGE_SIZE = 25;

export async function listAdminEntitlementsUseCase(
  actor: ActorContext,
  input: AdminEntitlementListFilters & { page: number },
  deps: { adminPaymentRepository: AdminPaymentRepository },
): Promise<AdminEntitlementListResult> {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }
  const limit = ADMIN_ENTITLEMENT_LIST_PAGE_SIZE;
  const offset = (Math.max(1, input.page) - 1) * limit;
  return deps.adminPaymentRepository.listEntitlements({
    userSearch: input.userSearch,
    activeOnly: input.activeOnly,
    limit,
    offset,
  });
}
