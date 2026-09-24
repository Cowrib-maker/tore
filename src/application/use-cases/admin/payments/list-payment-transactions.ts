import type { ActorContext } from "@/application/common/actor-context";
import { UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import type {
  AdminPaymentRepository,
  AdminPaymentTransactionListFilters,
  AdminPaymentTransactionListResult,
} from "@/domain/repositories/admin-payment-repository";

export const ADMIN_PAYMENT_TRANSACTION_LIST_PAGE_SIZE = 25;

export async function listAdminPaymentTransactionsUseCase(
  actor: ActorContext,
  input: AdminPaymentTransactionListFilters & { page: number },
  deps: { adminPaymentRepository: AdminPaymentRepository },
): Promise<AdminPaymentTransactionListResult> {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }
  const limit = ADMIN_PAYMENT_TRANSACTION_LIST_PAGE_SIZE;
  const offset = (Math.max(1, input.page) - 1) * limit;
  return deps.adminPaymentRepository.listPaymentTransactions({
    status: input.status,
    provider: input.provider,
    userSearch: input.userSearch,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    limit,
    offset,
  });
}
