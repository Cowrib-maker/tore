import type {
  AttachProviderInvoiceInput,
  CreateInvoiceInput,
  CreatePaymentTransactionInput,
  Invoice,
  PaymentTransaction,
} from "@/domain/entities/invoice";
import type { InvoiceStatus } from "@/domain/enums";

export class DuplicatePaymentError extends Error {
  constructor(message = "Duplicate payment transaction") {
    super(message);
    this.name = "DuplicatePaymentError";
  }
}

export interface InvoiceRepository {
  create(input: CreateInvoiceInput): Promise<Invoice>;
  findById(id: string): Promise<Invoice | null>;
  findByProviderInvoiceId(providerInvoiceId: string): Promise<Invoice | null>;
  findByBookingId(bookingId: string): Promise<Invoice | null>;
  findLatestPendingForUser(
    userId: string,
    now: Date,
  ): Promise<Invoice | null>;
  listByUserId(userId: string): Promise<Invoice[]>;
  attachProviderInvoice(
    id: string,
    input: AttachProviderInvoiceInput,
  ): Promise<Invoice>;
  updateStatus(id: string, status: InvoiceStatus): Promise<Invoice>;
  linkSubscription(id: string, subscriptionId: string): Promise<Invoice>;
}

export interface PaymentTransactionRepository {
  create(input: CreatePaymentTransactionInput): Promise<PaymentTransaction>;
  findByInvoiceId(invoiceId: string): Promise<PaymentTransaction | null>;
  findByProviderPaymentId(
    providerPaymentId: string,
  ): Promise<PaymentTransaction | null>;
}
