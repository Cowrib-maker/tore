import type { ActorContext } from "@/application/common/actor-context";
import { UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import type {
  AdminInvoiceListFilters,
  AdminInvoiceListResult,
  AdminPaymentRepository,
} from "@/domain/repositories/admin-payment-repository";

export const ADMIN_INVOICE_LIST_PAGE_SIZE = 25;

export async function listAdminInvoicesUseCase(
  actor: ActorContext,
  input: AdminInvoiceListFilters & { page: number },
  deps: { adminPaymentRepository: AdminPaymentRepository },
): Promise<AdminInvoiceListResult> {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }
  const limit = ADMIN_INVOICE_LIST_PAGE_SIZE;
  const offset = (Math.max(1, input.page) - 1) * limit;
  return deps.adminPaymentRepository.listInvoices({
    status: input.status,
    planCode: input.planCode,
    provider: input.provider,
    userSearch: input.userSearch,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    limit,
    offset,
  });
}
