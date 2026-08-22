import type { InvoiceRepository } from "@/domain/repositories/invoice-repository";
import type { PaymentTransactionRepository } from "@/domain/repositories/invoice-repository";
import type { SubscriptionRepository } from "@/domain/repositories/subscription-repository";

export type BillingRepositories = {
  subscriptionRepository: SubscriptionRepository;
  invoiceRepository: InvoiceRepository;
  paymentTransactionRepository: PaymentTransactionRepository;
};

export interface BillingUnitOfWork {
  runInTransaction<T>(
    work: (repos: BillingRepositories) => Promise<T>,
  ): Promise<T>;
}
