import type {
  AttachProviderInvoiceInput,
  CreateInvoiceInput,
  CreatePaymentTransactionInput,
  Invoice,
  PaymentTransaction,
  RecordManualVerificationInput,
} from "@/domain/entities/invoice";
import type { InvoiceStatus } from "@/domain/enums";

export class DuplicatePaymentError extends Error {
  constructor(message = "Duplicate payment transaction") {
    super(message);
    this.name = "DuplicatePaymentError";
  }
}

/**
 * Thrown when `InvoiceRepository.create()` is given a `paymentCode` that
 * another PENDING/AWAITING_VERIFICATION invoice already holds (enforced by
 * a database-level partial unique index, never by an app-level
 * check-then-insert alone — see the migration that adds `payment_code`).
 * Callers should generate a fresh code and retry a bounded number of times.
 */
export class DuplicatePaymentCodeError extends Error {
  constructor(message = "Duplicate active payment code") {
    super(message);
    this.name = "DuplicatePaymentCodeError";
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
  listByStatus(status: InvoiceStatus): Promise<Invoice[]>;
  /**
   * Atomically records an admin's verify/reject decision on a manual
   * payment claim — status + verifiedByUserId + verifiedAt (+
   * rejectionReason on reject) in one write, so an invoice can never end
   * up PAID/FAILED without the audit fields that explain who decided it.
   */
  recordManualVerification(
    id: string,
    input: RecordManualVerificationInput,
  ): Promise<Invoice>;
}

export interface PaymentTransactionRepository {
  create(input: CreatePaymentTransactionInput): Promise<PaymentTransaction>;
  findByInvoiceId(invoiceId: string): Promise<PaymentTransaction | null>;
  findByProviderPaymentId(
    providerPaymentId: string,
  ): Promise<PaymentTransaction | null>;
}
