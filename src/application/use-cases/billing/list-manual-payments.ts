import type { ActorContext } from "@/application/common/actor-context";
import type { Invoice } from "@/domain/entities/invoice";
import { InvoiceStatus, UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import type { InvoiceRepository } from "@/domain/repositories/invoice-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";

export type ManualPaymentListItem = Invoice & {
  userEmail: string | null;
  userName: string | null;
};

export type ListManualPaymentsDeps = {
  invoiceRepository: InvoiceRepository;
  userRepository: UserRepository;
};

/**
 * Admin queue of manual (bank transfer / printed QR) payments. Defaults
 * to AWAITING_VERIFICATION (the actionable queue); PAID/FAILED are for
 * the history tabs. One batched user lookup for the whole list — never
 * one query per row.
 */
export async function listManualPayments(
  actor: ActorContext,
  status: InvoiceStatus,
  deps: ListManualPaymentsDeps,
): Promise<ManualPaymentListItem[]> {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }

  const invoices = (await deps.invoiceRepository.listByStatus(status)).filter(
    (invoice) => invoice.provider.startsWith("MANUAL_"),
  );
  if (invoices.length === 0) {
    return [];
  }

  const users = await deps.userRepository.findByIds([...new Set(invoices.map((i) => i.userId))]);
  const userById = new Map(users.map((user) => [user.id, user]));

  return invoices.map((invoice) => {
    const user = userById.get(invoice.userId);
    return {
      ...invoice,
      userEmail: user?.email ?? null,
      userName: user?.name ?? null,
    };
  });
}
