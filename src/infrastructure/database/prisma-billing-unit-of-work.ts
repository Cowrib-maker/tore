import { Prisma } from "@/generated/prisma/client";

import type {
  BillingRepositories,
  BillingUnitOfWork,
} from "@/domain/ports/billing-unit-of-work";
import { prisma } from "@/infrastructure/database/prisma";
import { PrismaInvoiceRepository } from "@/infrastructure/repositories/prisma-invoice-repository";
import { PrismaPaymentTransactionRepository } from "@/infrastructure/repositories/prisma-payment-transaction-repository";
import { PrismaSubscriptionRepository } from "@/infrastructure/repositories/prisma-subscription-repository";

export class PrismaBillingUnitOfWork implements BillingUnitOfWork {
  async runInTransaction<T>(
    work: (repos: BillingRepositories) => Promise<T>,
  ): Promise<T> {
    return prisma.$transaction(
      async (tx) => {
        const repos: BillingRepositories = {
          subscriptionRepository: new PrismaSubscriptionRepository(tx),
          invoiceRepository: new PrismaInvoiceRepository(tx),
          paymentTransactionRepository: new PrismaPaymentTransactionRepository(
            tx,
          ),
        };
        return work(repos);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

export const billingUnitOfWork = new PrismaBillingUnitOfWork();
