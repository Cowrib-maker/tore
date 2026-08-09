import type {
  DisputeStatus,
  PaymentStatus,
  PayoutStatus,
  RefundStatus,
} from "@/domain/enums";

export interface Payment {
  id: string;
  bookingId: string;
  clientUserId: string;
  amountMnt: number;
  platformFeeMnt: number;
  lawyerNetMnt: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  providerPaymentId: string | null;
  providerReceiptUrl: string | null;
  paidAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentInput {
  bookingId: string;
  clientUserId: string;
  amountMnt: number;
  platformFeeMnt: number;
  lawyerNetMnt: number;
  provider: string;
}

export interface Payout {
  id: string;
  paymentId: string;
  lawyerProfileId: string;
  amountMnt: number;
  status: PayoutStatus;
  processedByUserId: string | null;
  processedAt: Date | null;
  payoutReference: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePayoutInput {
  paymentId: string;
  lawyerProfileId: string;
  amountMnt: number;
}

export interface Refund {
  id: string;
  paymentId: string;
  bookingId: string;
  amountMnt: number;
  status: RefundStatus;
  reason: string;
  requestedByUserId: string;
  processedByUserId: string | null;
  processedAt: Date | null;
  providerRefundId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RequestRefundInput {
  paymentId: string;
  bookingId: string;
  amountMnt: number;
  reason: string;
  requestedByUserId: string;
}

export interface Dispute {
  id: string;
  bookingId: string;
  raisedByUserId: string;
  reason: string;
  status: DisputeStatus;
  resolutionNotes: string | null;
  resolvedByUserId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OpenDisputeInput {
  bookingId: string;
  raisedByUserId: string;
  reason: string;
}

export interface ResolveDisputeInput {
  status: DisputeStatus;
  resolutionNotes: string;
  resolvedByUserId: string;
}
