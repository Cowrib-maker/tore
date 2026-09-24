import type { ActorContext } from "@/application/common/actor-context";
import { UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import type {
  AdminPaymentDashboardTotals,
  AdminPaymentRepository,
} from "@/domain/repositories/admin-payment-repository";

export async function getAdminPaymentDashboardUseCase(
  actor: ActorContext,
  deps: { adminPaymentRepository: AdminPaymentRepository },
  now: Date = new Date(),
): Promise<AdminPaymentDashboardTotals> {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }
  return deps.adminPaymentRepository.getDashboardTotals(now);
}
