import type { ActorContext } from "@/application/common/actor-context";
import { assertLawyerEntitlementActor } from "@/application/use-cases/entitlements/ensure-lawyer-solo-subscription";
import { ensurePlatformDemoSubscription } from "@/application/use-cases/entitlements/ensure-platform-demo-subscription";
import { toSoloCheckoutView, type SoloCheckoutView } from "@/application/use-cases/billing/checkout-view";
import {
  listOwnDeviceSessions,
  type DeviceSessionView,
} from "@/application/use-cases/sessions/manage-device-sessions";
import { touchDeviceSession } from "@/application/use-cases/sessions/touch-device-session";
import type { SessionProtectionPolicy } from "@/domain/constants/session-protection-policy";
import { PLATFORM_SETTING_KEYS } from "@/domain/constants/platform-settings";
import { parseSessionProtectionPolicy } from "@/domain/constants/session-protection-policy";
import { SOLO_PLAN, getPlanDefinition } from "@/domain/constants/subscription-plans";
import { AccountSharingRiskState, SubscriptionStatus } from "@/domain/enums";
import type { InvoiceRepository } from "@/domain/repositories/invoice-repository";
import type { DeviceSessionRepository } from "@/domain/repositories/device-session-repository";
import type { EntitlementUsageRepository } from "@/domain/repositories/entitlement-usage-repository";
import type { PlatformSettingRepository } from "@/domain/repositories/platform-setting-repository";
import type { SubscriptionRepository } from "@/domain/repositories/subscription-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";
import {
  evaluateAccountSharingRisk,
  type AccountSharingRiskResult,
} from "@/domain/services/account-sharing-risk";
import {
  resolveBillingDisplayStatus,
  shouldPersistExpired,
  type BillingDisplayStatus,
} from "@/domain/services/billing-display-status";
import {
  isSubscriptionActive,
  resolveLawyerEntitlement,
  toPublicUsageSnapshot,
  utcMonthStart,
  type LawyerEntitlement,
  type PublicUsageSnapshot,
} from "@/domain/services/entitlement";

export type BillingSnapshotDeps = {
  subscriptionRepository: SubscriptionRepository;
  deviceSessionRepository: DeviceSessionRepository;
  entitlementUsageRepository: EntitlementUsageRepository;
  platformSettingRepository: PlatformSettingRepository;
  invoiceRepository: InvoiceRepository;
  userRepository?: Pick<UserRepository, "findById">;
};

export type LawyerBillingSnapshot = {
  entitlement: LawyerEntitlement | null;
  billingRequired: boolean;
  subscriptionStatus: BillingDisplayStatus;
  expiresAt: Date | null;
  planName: string;
  priceMnt: number;
  seatLimit: number;
  usage: PublicUsageSnapshot;
  risk: AccountSharingRiskResult;
  sessions: DeviceSessionView[];
  currentSessionId: string;
  pendingInvoice: SoloCheckoutView | null;
};

export async function loadSessionProtectionPolicy(
  platformSettingRepository: PlatformSettingRepository,
): Promise<SessionProtectionPolicy> {
  const setting = await platformSettingRepository.findByKey(
    PLATFORM_SETTING_KEYS.SESSION_PROTECTION_POLICY,
  );
  return parseSessionProtectionPolicy(setting?.value);
}

export async function getLawyerBillingSnapshot(
  actor: ActorContext,
  input: {
    sessionIdFromCookie?: string | null;
    userAgent?: string | null;
    ipHash?: string | null;
    now?: Date;
  },
  deps: BillingSnapshotDeps,
): Promise<LawyerBillingSnapshot> {
  assertLawyerEntitlementActor(actor);
  const now = input.now ?? new Date();
  const policy = await loadSessionProtectionPolicy(deps.platformSettingRepository);

  if (deps.userRepository) {
    await ensurePlatformDemoSubscription(actor, {
      userRepository: deps.userRepository,
      subscriptionRepository: deps.subscriptionRepository,
    }, now);
  }

  let subscription = await deps.subscriptionRepository.findLatestOwnedByUserId(
    actor.userId,
    SOLO_PLAN.code,
  );
  if (subscription && shouldPersistExpired(subscription, now)) {
    try {
      subscription = await deps.subscriptionRepository.updateStatus(
        subscription.id,
        SubscriptionStatus.EXPIRED,
      );
    } catch {
      subscription = {
        ...subscription,
        status: SubscriptionStatus.EXPIRED,
      };
    }
  }

  const active = subscription && isSubscriptionActive(subscription, now)
    ? subscription
    : null;
  const entitlement = subscription
    ? resolveLawyerEntitlement(subscription, now)
    : null;
  const pendingInvoice = await deps.invoiceRepository.findLatestPendingForUser(
    actor.userId,
    now,
  );

  const session = await touchDeviceSession(
    {
      userId: actor.userId,
      subscriptionId: active?.id ?? subscription?.id ?? null,
      sessionIdFromCookie: input.sessionIdFromCookie,
      userAgent: input.userAgent,
      ipHash: input.ipHash,
      now,
      policy,
    },
    deps,
  );

  const periodStart = entitlement?.periodStart ?? utcMonthStart(now);
  const [usage, activeSessions, sessions] = await Promise.all([
    deps.entitlementUsageRepository.getOrCreate({
      userId: actor.userId,
      subscriptionId: active?.id ?? subscription?.id ?? null,
      periodStart,
    }),
    deps.deviceSessionRepository.listActiveByUserId(actor.userId),
    listOwnDeviceSessions(actor, session.id, deps),
  ]);
  const risk = evaluateAccountSharingRisk({
    now,
    policy,
    sessions: activeSessions,
  });
  const plan = subscription
    ? getPlanDefinition(subscription.planCode)
    : SOLO_PLAN;
  const publicUsage = entitlement
    ? toPublicUsageSnapshot(entitlement, usage)
    : {
        caseAnalysis: {
          used: usage.caseAnalysisCount,
          limit: SOLO_PLAN.quotas.caseAnalysis,
        },
        documentAnalysis: {
          used: usage.documentAnalysisCount,
          limit: SOLO_PLAN.quotas.documentAnalysis,
        },
        legalAiQueries: {
          used: usage.legalAiQueryCount,
          limit: SOLO_PLAN.quotas.legalAiQueries,
        },
      };
  const subscriptionStatus = resolveBillingDisplayStatus({
    now,
    subscription,
    hasPendingInvoice: Boolean(pendingInvoice),
  });

  return {
    entitlement,
    billingRequired: !active,
    subscriptionStatus,
    expiresAt: subscription?.currentPeriodEnd ?? null,
    planName: plan.name,
    priceMnt: plan.priceMnt,
    seatLimit: plan.seatLimit,
    usage: publicUsage,
    risk,
    sessions,
    currentSessionId: session.id,
    pendingInvoice: pendingInvoice ? toSoloCheckoutView(pendingInvoice) : null,
  };
}

export function sharingWarningForState(
  state: AccountSharingRiskState,
): string | null {
  if (state === AccountSharingRiskState.SUSPICIOUS) {
    return "Your TORE account appears to be active on multiple devices. If this is a team account, please consider TORE Team.";
  }
  if (state === AccountSharingRiskState.HIGH_RISK) {
    return "Your TORE account appears to be active on multiple devices. If this is a team account, please consider TORE Team.";
  }
  return null;
}
