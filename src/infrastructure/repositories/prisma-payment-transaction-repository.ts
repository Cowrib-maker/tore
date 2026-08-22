import type {
  CreatePaymentTransactionInput,
  PaymentTransaction,
} from "@/domain/entities/invoice";
import type { PaymentTransactionStatus } from "@/domain/enums";
import {
  DuplicatePaymentError,
  type PaymentTransactionRepository,
} from "@/domain/repositories/invoice-repository";
import { Prisma } from "@/generated/prisma/client";
import { isPrismaUniqueViolation } from "@/infrastructure/database/prisma-errors";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";

function mapPayment(record: {
  id: string;
  invoiceId: string;
  provider: string;
  providerPaymentId: string;
  amountMnt: number;
  currency: string;
  status: string;
  paidAt: Date | null;
  metadataJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}): PaymentTransaction {
  return {
    id: record.id,
    invoiceId: record.invoiceId,
    provider: record.provider,
    providerPaymentId: record.providerPaymentId,
    amountMnt: record.amountMnt,
    currency: record.currency,
    status: record.status as PaymentTransactionStatus,
    paidAt: record.paidAt,
    metadata:
      record.metadataJson &&
      typeof record.metadataJson === "object" &&
      !Array.isArray(record.metadataJson)
        ? (record.metadataJson as Record<string, unknown>)
        : null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class PrismaPaymentTransactionRepository
  implements PaymentTransactionRepository
{
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async create(
    input: CreatePaymentTransactionInput,
  ): Promise<PaymentTransaction> {
    try {
      const record = await this.db.paymentTransaction.create({
        data: {
          invoiceId: input.invoiceId,
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
          amountMnt: input.amountMnt,
          currency: input.currency,
          status: input.status,
          paidAt: input.paidAt,
          metadataJson:
            input.metadata === undefined || input.metadata === null
              ? undefined
              : (input.metadata as Prisma.InputJsonValue),
        },
      });
      return mapPayment(record);
    } catch (error) {
      if (isPrismaUniqueViolation(error)) {
        throw new DuplicatePaymentError();
      }
      throw error;
    }
  }

  async findByInvoiceId(invoiceId: string): Promise<PaymentTransaction | null> {
    const record = await this.db.paymentTransaction.findUnique({
      where: { invoiceId },
    });
    return record ? mapPayment(record) : null;
  }

  async findByProviderPaymentId(
    providerPaymentId: string,
  ): Promise<PaymentTransaction | null> {
    const record = await this.db.paymentTransaction.findUnique({
      where: { providerPaymentId },
    });
    return record ? mapPayment(record) : null;
  }
}

export const paymentTransactionRepository =
  new PrismaPaymentTransactionRepository();
