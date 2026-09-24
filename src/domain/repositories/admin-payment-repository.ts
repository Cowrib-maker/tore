import type {
  InvoiceStatus,
  PaymentTransactionStatus,
  SubscriptionPlanCode,
  SubscriptionStatus,
} from "@/domain/enums";

/**
 * Read-only admin reporting surface over the existing billing tables
 * (Invoice / PaymentTransaction / Subscription / EntitlementUsage).
 * Deliberately separate from the transactional {@link InvoiceRepository}
 * / {@link SubscriptionRepository} used by the payment-processing
 * use-cases — this repository never writes, so it can join/aggregate
 * freely without risking the invariants those transactional repos
 * protect (e.g. one PaymentTransaction per Invoice).
 */

export type AdminPaymentDashboardTotals = {
  totalRevenueMnt: number;
  todayRevenueMnt: number;
  monthRevenueMnt: number;
  paidInvoiceCount: number;
  /** PENDING (QPay, not yet paid) + AWAITING_VERIFICATION (manual, user claimed) combined. */
  pendingInvoiceCount: number;
  failedInvoiceCount: number;
  expiredInvoiceCount: number;
  cancelledInvoiceCount: number;
  totalTransactionCount: number;
};

export type AdminInvoiceListItem = {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  planCode: SubscriptionPlanCode | null;
  amountMnt: number;
  currency: string;
  provider: string;
  providerInvoiceId: string | null;
  status: InvoiceStatus;
  createdAt: Date;
  paymentProviderPaymentId: string | null;
  paymentPaidAt: Date | null;
  verifiedByUserId: string | null;
  verifiedAt: Date | null;
  rejectionReason: string | null;
  /** Customer-facing "Гүйлгээний утга" for manual invoices — null for QPay. */
  paymentCode: string | null;
};

export type AdminInvoiceListFilters = {
  status?: InvoiceStatus;
  planCode?: SubscriptionPlanCode;
  provider?: string;
  /** Matches user email or name (case-insensitive substring). */
  userSearch?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

export type AdminInvoiceListInput = AdminInvoiceListFilters & {
  limit: number;
  offset: number;
};

export type AdminInvoiceListResult = {
  items: AdminInvoiceListItem[];
  total: number;
};

export type AdminPaymentTransactionListItem = {
  id: string;
  invoiceId: string;
  userId: string | null;
  userEmail: string | null;
  planCode: SubscriptionPlanCode | null;
  provider: string;
  providerPaymentId: string;
  amountMnt: number;
  currency: string;
  status: PaymentTransactionStatus;
  paidAt: Date | null;
  createdAt: Date;
};

export type AdminPaymentTransactionListFilters = {
  status?: PaymentTransactionStatus;
  provider?: string;
  userSearch?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

export type AdminPaymentTransactionListInput =
  AdminPaymentTransactionListFilters & {
    limit: number;
    offset: number;
  };

export type AdminPaymentTransactionListResult = {
  items: AdminPaymentTransactionListItem[];
  total: number;
};

export type AdminSubscriptionListItem = {
  id: string;
  ownerUserId: string;
  userEmail: string | null;
  userName: string | null;
  planCode: SubscriptionPlanCode;
  status: SubscriptionStatus;
  seatLimit: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  providerInvoiceId: string | null;
  createdAt: Date;
};

export type AdminSubscriptionListFilters = {
  status?: SubscriptionStatus;
  planCode?: SubscriptionPlanCode;
  userSearch?: string;
};

export type AdminSubscriptionListInput = AdminSubscriptionListFilters & {
  limit: number;
  offset: number;
};

export type AdminSubscriptionListResult = {
  items: AdminSubscriptionListItem[];
  total: number;
};

export type AdminEntitlementListItem = {
  userId: string;
  userEmail: string | null;
  userName: string | null;
  subscriptionId: string | null;
  planCode: SubscriptionPlanCode | null;
  subscriptionStatus: SubscriptionStatus | null;
  currentPeriodEnd: Date | null;
  periodStart: Date;
  caseAnalysisCount: number;
  documentAnalysisCount: number;
  legalAiQueryCount: number;
};

export type AdminEntitlementListFilters = {
  userSearch?: string;
  /** Only rows whose subscription is ACTIVE and currentPeriodEnd is in the future. */
  activeOnly?: boolean;
};

export type AdminEntitlementListInput = AdminEntitlementListFilters & {
  limit: number;
  offset: number;
};

export type AdminEntitlementListResult = {
  items: AdminEntitlementListItem[];
  total: number;
};

export type UserPaymentTraceInvoice = {
  id: string;
  amountMnt: number;
  currency: string;
  provider: string;
  providerInvoiceId: string | null;
  status: InvoiceStatus;
  createdAt: Date;
  verifiedByUserId: string | null;
  verifiedAt: Date | null;
  rejectionReason: string | null;
  paymentCode: string | null;
  payment: {
    providerPaymentId: string;
    status: PaymentTransactionStatus;
    paidAt: Date | null;
  } | null;
};

export type UserPaymentTraceSubscription = {
  id: string;
  planCode: SubscriptionPlanCode;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  createdAt: Date;
  invoices: UserPaymentTraceInvoice[];
};

export type UserPaymentTrace = {
  userId: string;
  userEmail: string | null;
  userName: string | null;
  subscriptions: UserPaymentTraceSubscription[];
  /** Invoices for this user not (yet) linked to any subscription — e.g. still PENDING. */
  unlinkedInvoices: UserPaymentTraceInvoice[];
};

export type QpayActivitySummary = {
  lastInvoiceCreatedAt: Date | null;
  lastPaymentPaidAt: Date | null;
  paidInvoiceCount: number;
  failedInvoiceCount: number;
  pendingInvoiceCount: number;
};

export interface AdminPaymentRepository {
  getDashboardTotals(now: Date): Promise<AdminPaymentDashboardTotals>;
  listInvoices(input: AdminInvoiceListInput): Promise<AdminInvoiceListResult>;
  listPaymentTransactions(
    input: AdminPaymentTransactionListInput,
  ): Promise<AdminPaymentTransactionListResult>;
  listSubscriptions(
    input: AdminSubscriptionListInput,
  ): Promise<AdminSubscriptionListResult>;
  listEntitlements(
    input: AdminEntitlementListInput,
  ): Promise<AdminEntitlementListResult>;
  /** Null when no user exists with this id. */
  getUserPaymentTrace(userId: string): Promise<UserPaymentTrace | null>;
  getQpayActivitySummary(now: Date): Promise<QpayActivitySummary>;
}
