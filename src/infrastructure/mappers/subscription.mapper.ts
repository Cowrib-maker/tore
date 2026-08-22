import type {
  DeviceSession,
  EntitlementUsage,
  Subscription,
  SubscriptionSeat,
} from "@/domain/entities/subscription";
import type {
  DeviceSessionStatus,
  SeatStatus,
  SubscriptionPlanCode,
  SubscriptionStatus,
} from "@/domain/enums";

export function mapSubscription(record: {
  id: string;
  ownerUserId: string;
  planCode: string;
  status: string;
  seatLimit: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  providerInvoiceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Subscription {
  return {
    id: record.id,
    ownerUserId: record.ownerUserId,
    planCode: record.planCode as SubscriptionPlanCode,
    status: record.status as SubscriptionStatus,
    seatLimit: record.seatLimit,
    currentPeriodStart: record.currentPeriodStart,
    currentPeriodEnd: record.currentPeriodEnd,
    providerInvoiceId: record.providerInvoiceId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function mapSeat(record: {
  id: string;
  subscriptionId: string;
  userId: string;
  status: string;
  assignedAt: Date;
  revokedAt: Date | null;
}): SubscriptionSeat {
  return {
    id: record.id,
    subscriptionId: record.subscriptionId,
    userId: record.userId,
    status: record.status as SeatStatus,
    assignedAt: record.assignedAt,
    revokedAt: record.revokedAt,
  };
}

export function mapDeviceSession(record: {
  id: string;
  userId: string;
  subscriptionId: string | null;
  userAgent: string | null;
  ipHash: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  status: string;
  requestCountWindowStart: Date | null;
  requestCountInWindow: number;
}): DeviceSession {
  return {
    id: record.id,
    userId: record.userId,
    subscriptionId: record.subscriptionId,
    userAgent: record.userAgent,
    ipHash: record.ipHash,
    firstSeenAt: record.firstSeenAt,
    lastSeenAt: record.lastSeenAt,
    revokedAt: record.revokedAt,
    status: record.status as DeviceSessionStatus,
    requestCountWindowStart: record.requestCountWindowStart,
    requestCountInWindow: record.requestCountInWindow,
  };
}

export function mapEntitlementUsage(record: {
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
}): EntitlementUsage {
  return {
    id: record.id,
    userId: record.userId,
    subscriptionId: record.subscriptionId,
    periodStart: record.periodStart,
    caseAnalysisCount: record.caseAnalysisCount,
    documentAnalysisCount: record.documentAnalysisCount,
    legalAiQueryCount: record.legalAiQueryCount,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    updatedAt: record.updatedAt,
  };
}
