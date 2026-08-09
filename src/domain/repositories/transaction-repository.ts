import type {
  CreatePaymentInput,
  CreatePayoutInput,
  Dispute,
  OpenDisputeInput,
  Payment,
  Payout,
  Refund,
  RequestRefundInput,
  ResolveDisputeInput,
} from "@/domain/entities/transaction";
import type { PaymentStatus, PayoutStatus, RefundStatus } from "@/domain/enums";

export interface PaymentRepository {
  findById(id: string): Promise<Payment | null>;
  findByBookingId(bookingId: string): Promise<Payment | null>;
  findByProviderPaymentId(providerPaymentId: string): Promise<Payment | null>;
  create(input: CreatePaymentInput): Promise<Payment>;
  updateStatus(id: string, status: PaymentStatus): Promise<Payment>;
  markPaid(id: string, providerPaymentId: string, receiptUrl?: string): Promise<Payment>;
  markFailed(id: string, failureReason: string): Promise<Payment>;
}

export interface PayoutRepository {
  findById(id: string): Promise<Payout | null>;
  findByPaymentId(paymentId: string): Promise<Payout | null>;
  findByLawyerProfileId(
    lawyerProfileId: string,
    status?: PayoutStatus,
  ): Promise<Payout[]>;
  create(input: CreatePayoutInput): Promise<Payout>;
  markProcessing(id: string): Promise<Payout>;
  markPaid(id: string, payoutReference: string, processedByUserId: string): Promise<Payout>;
  markFailed(id: string, notes?: string): Promise<Payout>;
}

export interface RefundRepository {
  findById(id: string): Promise<Refund | null>;
  findByPaymentId(paymentId: string): Promise<Refund[]>;
  findByBookingId(bookingId: string): Promise<Refund[]>;
  create(input: RequestRefundInput): Promise<Refund>;
  updateStatus(id: string, status: RefundStatus): Promise<Refund>;
  markProcessed(
    id: string,
    processedByUserId: string,
    providerRefundId?: string,
  ): Promise<Refund>;
}

export interface DisputeRepository {
  findById(id: string): Promise<Dispute | null>;
  findByBookingId(bookingId: string): Promise<Dispute | null>;
  findOpen(): Promise<Dispute[]>;
  create(input: OpenDisputeInput): Promise<Dispute>;
  resolve(id: string, input: ResolveDisputeInput): Promise<Dispute>;
}
