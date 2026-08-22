import type {
  DeviceSessionStatus,
  SeatStatus,
  SubscriptionPlanCode,
  SubscriptionStatus,
} from "@/domain/enums";

export type Subscription = {
  id: string;
  ownerUserId: string;
  planCode: SubscriptionPlanCode;
  status: SubscriptionStatus;
  seatLimit: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  providerInvoiceId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SubscriptionSeat = {
  id: string;
  subscriptionId: string;
  userId: string;
  status: SeatStatus;
  assignedAt: Date;
  revokedAt: Date | null;
};

export type DeviceSession = {
  id: string;
  userId: string;
  subscriptionId: string | null;
  userAgent: string | null;
  ipHash: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  status: DeviceSessionStatus;
  requestCountWindowStart: Date | null;
  requestCountInWindow: number;
};

export type EntitlementUsage = {
  id: string;
  userId: string;
  subscriptionId: string | null;
  periodStart: Date;
  caseAnalysisCount: number;
  documentAnalysisCount: number;
  legalAiQueryCount: number;
  inputTokens: number;
  outputTokens: number;
  updatedAt: Date;
};

export type CreateSubscriptionInput = {
  ownerUserId: string;
  planCode: SubscriptionPlanCode;
  status: SubscriptionStatus;
  seatLimit: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  providerInvoiceId?: string | null;
};

export type CreateSeatInput = {
  subscriptionId: string;
  userId: string;
  status?: SeatStatus;
};

export type CreateDeviceSessionInput = {
  id?: string;
  userId: string;
  subscriptionId?: string | null;
  userAgent?: string | null;
  ipHash?: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  requestCountWindowStart?: Date | null;
  requestCountInWindow?: number;
};

export type TouchDeviceSessionInput = {
  lastSeenAt: Date;
  userAgent?: string | null;
  ipHash?: string | null;
  subscriptionId?: string | null;
  requestCountWindowStart: Date;
  requestCountInWindow: number;
};

export type CreateEntitlementUsageInput = {
  userId: string;
  subscriptionId?: string | null;
  periodStart: Date;
};

export type EntitlementUsageIncrement = {
  caseAnalysisCount?: number;
  documentAnalysisCount?: number;
  legalAiQueryCount?: number;
  inputTokens?: number;
  outputTokens?: number;
};
