import {
  CITIZEN_BILLING_REQUIRED_MESSAGE,
  CITIZEN_PLANS,
  GUEST_FREE_LEGAL_QUESTIONS,
  LEGAL_AI_AUTHENTICATION_REQUIRED_MESSAGE,
  BILLING_REQUIRED_MESSAGE,
  SUBSCRIPTION_EXPIRY_WARNING_MS,
  UNPAID_CITIZEN_FREE_LEGAL_QUESTIONS,
  getPlanDefinition,
} from "@/domain/constants/subscription-plans";
import {
  PLATFORM_DEMO_PLAN_NAME,
  PLATFORM_DEMO_UNLIMITED_REMAINING,
  isPlatformDemoEmail,
} from "@/domain/constants/platform-demo-accounts";
import { EntitlementFeature, UserRole } from "@/domain/enums";
import { EntitlementError } from "@/domain/errors/entitlement-error";
import type { EntitlementUsageRepository } from "@/domain/repositories/entitlement-usage-repository";
import type { SubscriptionRepository } from "@/domain/repositories/subscription-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";
import {
  emptyUsageCounts,
  evaluateFeatureQuota,
  isSubscriptionActive,
  resolveLawyerEntitlement,
} from "@/domain/services/entitlement";
import {
  ensurePlatformDemoSubscription,
} from "@/application/use-cases/entitlements/ensure-platform-demo-subscription";

export type LegalQuestionSubject =
  | { kind: "guest"; guestSessionId: string }
  | { kind: "user"; userId: string; role: UserRole };

export type LegalQuestionAccessPort = {
  assertCanStartNewLegalQuestion(subject: LegalQuestionSubject): Promise<void>;
  consumeNewLegalQuestion(subject: LegalQuestionSubject): Promise<void>;
  hasPaidLegalAiAccess(subject: LegalQuestionSubject): Promise<boolean>;
};

export type GuestSessionRecord = {
  id: string;
  freeLegalQuestionsUsed: number;
  expiresAt: Date;
};

export type GuestSessionStore = {
  getById(id: string): Promise<GuestSessionRecord | null>;
  incrementFreeLegalQuestionsUsed(id: string): Promise<void>;
};

export type ConversationBillingStore = {
  countBilledQuestionsForUser(userId: string): Promise<number>;
};

type LegalQuestionAccessDeps = {
  guestSessions: GuestSessionStore;
  conversations: ConversationBillingStore;
  subscriptionRepository: SubscriptionRepository;
  entitlementUsageRepository: EntitlementUsageRepository;
  userRepository?: Pick<UserRepository, "findById">;
  now?: () => Date;
};

export function allowAllLegalQuestionAccess(): LegalQuestionAccessPort {
  return {
    async assertCanStartNewLegalQuestion() {},
    async consumeNewLegalQuestion() {},
    async hasPaidLegalAiAccess() {
      return false;
    },
  };
}

export function createLegalQuestionAccess(
  deps: LegalQuestionAccessDeps,
): LegalQuestionAccessPort {
  const now = deps.now ?? (() => new Date());

  return {
    async assertCanStartNewLegalQuestion(subject) {
      if (subject.kind === "guest") {
        const session = await requireLiveGuest(
          deps.guestSessions,
          subject.guestSessionId,
        );
        if (session.freeLegalQuestionsUsed >= GUEST_FREE_LEGAL_QUESTIONS) {
          throw new EntitlementError(
            LEGAL_AI_AUTHENTICATION_REQUIRED_MESSAGE,
            "AUTHENTICATION_REQUIRED",
            401,
          );
        }
        return;
      }

      if (await isDemoSubject(subject, deps, now())) {
        return;
      }

      if (subject.role === UserRole.LAWYER) {
        await assertPaidLegalAiQuota(subject.userId, deps, now(), BILLING_REQUIRED_MESSAGE);
        return;
      }

      const paid = await findActiveCitizenSubscription(
        subject.userId,
        deps.subscriptionRepository,
        now(),
      );
      if (paid) {
        await assertPaidLegalAiQuota(
          subject.userId,
          deps,
          now(),
          CITIZEN_BILLING_REQUIRED_MESSAGE,
        );
        return;
      }

      const used = await deps.conversations.countBilledQuestionsForUser(
        subject.userId,
      );
      if (used >= UNPAID_CITIZEN_FREE_LEGAL_QUESTIONS) {
        throw new EntitlementError(
          CITIZEN_BILLING_REQUIRED_MESSAGE,
          "BILLING_REQUIRED",
          402,
        );
      }
    },

    async consumeNewLegalQuestion(subject) {
      if (subject.kind === "guest") {
        await deps.guestSessions.incrementFreeLegalQuestionsUsed(
          subject.guestSessionId,
        );
        return;
      }

      if (await isDemoSubject(subject, deps, now())) {
        return;
      }

      const paidLawyer = subject.role === UserRole.LAWYER;
      const paidCitizen = paidLawyer
        ? null
        : await findActiveCitizenSubscription(
            subject.userId,
            deps.subscriptionRepository,
            now(),
          );
      if (paidLawyer || paidCitizen) {
        await incrementLegalAiQuery(subject.userId, deps, now());
      }
    },

    async hasPaidLegalAiAccess(subject) {
      if (subject.kind === "guest") {
        return false;
      }
      if (await isDemoSubject(subject, deps, now())) {
        return true;
      }
      if (subject.role === UserRole.LAWYER) {
        const seated =
          await deps.subscriptionRepository.findActiveSeatForUser(
            subject.userId,
          );
        const owned =
          seated?.subscription ??
          (await deps.subscriptionRepository.findActiveOwnedByUserId(
            subject.userId,
          ));
        return Boolean(owned && isSubscriptionActive(owned, now()));
      }
      return Boolean(
        await findActiveCitizenSubscription(
          subject.userId,
          deps.subscriptionRepository,
          now(),
        ),
      );
    },
  };
}

async function isDemoSubject(
  subject: Extract<LegalQuestionSubject, { kind: "user" }>,
  deps: LegalQuestionAccessDeps,
  at: Date,
): Promise<boolean> {
  if (!deps.userRepository) {
    return false;
  }
  const user = await deps.userRepository.findById(subject.userId);
  if (!isPlatformDemoEmail(user?.email)) {
    return false;
  }
  await ensurePlatformDemoSubscription(subject, {
    userRepository: deps.userRepository,
    subscriptionRepository: deps.subscriptionRepository,
  }, at);
  return true;
}

async function requireLiveGuest(
  store: GuestSessionStore,
  id: string,
): Promise<GuestSessionRecord> {
  const session = await store.getById(id);
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    throw new EntitlementError(
      LEGAL_AI_AUTHENTICATION_REQUIRED_MESSAGE,
      "AUTHENTICATION_REQUIRED",
      401,
    );
  }
  return session;
}

async function findActiveCitizenSubscription(
  userId: string,
  subscriptions: SubscriptionRepository,
  at: Date,
) {
  const owned = await subscriptions.findActiveOwnedByUserId(userId);
  if (
    owned &&
    isSubscriptionActive(owned, at) &&
    CITIZEN_PLANS.includes(owned.planCode)
  ) {
    return owned;
  }
  const seated = await subscriptions.findActiveSeatForUser(userId);
  if (
    seated &&
    isSubscriptionActive(seated.subscription, at) &&
    CITIZEN_PLANS.includes(seated.subscription.planCode)
  ) {
    return seated.subscription;
  }
  return null;
}

async function assertPaidLegalAiQuota(
  userId: string,
  deps: {
    subscriptionRepository: SubscriptionRepository;
    entitlementUsageRepository: EntitlementUsageRepository;
  },
  at: Date,
  billingMessage: string,
) {
  const seated = await deps.subscriptionRepository.findActiveSeatForUser(userId);
  const owned =
    seated?.subscription ??
    (await deps.subscriptionRepository.findActiveOwnedByUserId(userId));
  if (!owned || !isSubscriptionActive(owned, at)) {
    throw new EntitlementError(billingMessage, "BILLING_REQUIRED", 402);
  }
  const entitlement = resolveLawyerEntitlement(owned, at);
  const usage = await deps.entitlementUsageRepository.getOrCreate({
    userId,
    subscriptionId: owned.id,
    periodStart: entitlement.periodStart,
  });
  const decision = evaluateFeatureQuota({
    feature: EntitlementFeature.LEGAL_AI_QUERY,
    entitlement,
    usage: usage ?? emptyUsageCounts(),
  });
  if (!decision.ok) {
    throw new EntitlementError(
      decision.message,
      decision.kind === "TOKEN" ? "TOKEN_CEILING_REACHED" : "FEATURE_QUOTA_EXCEEDED",
    );
  }
}

async function incrementLegalAiQuery(
  userId: string,
  deps: {
    subscriptionRepository: SubscriptionRepository;
    entitlementUsageRepository: EntitlementUsageRepository;
  },
  at: Date,
) {
  const seated = await deps.subscriptionRepository.findActiveSeatForUser(userId);
  const owned =
    seated?.subscription ??
    (await deps.subscriptionRepository.findActiveOwnedByUserId(userId));
  if (!owned) {
    return;
  }
  const entitlement = resolveLawyerEntitlement(owned, at);
  const usage = await deps.entitlementUsageRepository.getOrCreate({
    userId,
    subscriptionId: owned.id,
    periodStart: entitlement.periodStart,
  });
  await deps.entitlementUsageRepository.increment(usage.id, {
    legalAiQueryCount: 1,
  });
}

export type LegalQuestionEntitlementSnapshot = {
  audience: "guest" | "unpaid_citizen" | "paid_citizen" | "lawyer";
  planName: string | null;
  remainingLegalQuestions: number;
  remainingKind: "guest_free" | "unpaid_free" | "plan_quota";
  exhaustedNextStep: "login" | "billing" | "wait_period";
  statusLabel: string;
  remainingLabel: string;
  exhaustedLabel: string;
  currentPeriodEnd: string | null;
  expiresSoon: boolean;
  expiryWarningLabel: string | null;
};

export async function getLegalQuestionEntitlementSnapshot(
  subject:
    | { kind: "anonymous" }
    | { kind: "guest"; guestSessionId: string }
    | { kind: "user"; userId: string; role: UserRole },
  deps: {
    guestSessions: GuestSessionStore;
    conversations: ConversationBillingStore;
    subscriptionRepository: SubscriptionRepository;
    entitlementUsageRepository: EntitlementUsageRepository;
    userRepository?: Pick<UserRepository, "findById">;
    now?: () => Date;
  },
): Promise<LegalQuestionEntitlementSnapshot> {
  const now = deps.now ?? (() => new Date());

  if (subject.kind === "anonymous" || subject.kind === "guest") {
    const used =
      subject.kind === "guest"
        ? ((await deps.guestSessions.getById(subject.guestSessionId))
            ?.freeLegalQuestionsUsed ?? 0)
        : 0;
    const remaining = Math.max(0, GUEST_FREE_LEGAL_QUESTIONS - used);
    return copySnapshot({
      audience: "guest",
      planName: null,
      remainingLegalQuestions: remaining,
      remainingKind: "guest_free",
      exhaustedNextStep: "login",
      statusLabel: "Үнэгүй хууль зүйн асуулт",
      remainingLabel:
        remaining > 0
          ? `Үлдсэн үнэгүй асуулт: ${remaining}`
          : "Үнэгүй асуулт дууссан",
      exhaustedLabel:
        "Үнэгүй асуулт дуусмагц нэвтэрч, бүртгүүлнэ үү. Шинэ хууль зүйн асуулт автоматаар илгээгдэхгүй.",
    });
  }

  if (deps.userRepository) {
    const user = await deps.userRepository.findById(subject.userId);
    if (isPlatformDemoEmail(user?.email)) {
      await ensurePlatformDemoSubscription(subject, {
        userRepository: deps.userRepository,
        subscriptionRepository: deps.subscriptionRepository,
      }, now());
      return copySnapshot({
        audience: subject.role === UserRole.LAWYER ? "lawyer" : "paid_citizen",
        planName: PLATFORM_DEMO_PLAN_NAME,
        remainingLegalQuestions: PLATFORM_DEMO_UNLIMITED_REMAINING,
        remainingKind: "plan_quota",
        exhaustedNextStep: "wait_period",
        statusLabel: PLATFORM_DEMO_PLAN_NAME,
        remainingLabel: `Энэ сард үлдсэн хууль зүйн AI асуулт: ${PLATFORM_DEMO_UNLIMITED_REMAINING}+`,
        exhaustedLabel:
          "Founder demo эрх — төлбөртэй багц шаардлагагүй.",
      });
    }
  }

  if (subject.role === UserRole.LAWYER) {
    return paidPlanSnapshot(subject.userId, deps, now(), "lawyer");
  }

  const paid = await findActiveCitizenSubscription(
    subject.userId,
    deps.subscriptionRepository,
    now(),
  );
  if (paid) {
    return paidPlanSnapshot(subject.userId, deps, now(), "paid_citizen");
  }

  const billed = await deps.conversations.countBilledQuestionsForUser(
    subject.userId,
  );
  const remaining = Math.max(
    0,
    UNPAID_CITIZEN_FREE_LEGAL_QUESTIONS - billed,
  );
  return copySnapshot({
    audience: "unpaid_citizen",
    planName: null,
    remainingLegalQuestions: remaining,
    remainingKind: "unpaid_free",
    exhaustedNextStep: "billing",
    statusLabel: "Үнэгүй иргэний асуулт",
    remainingLabel:
      remaining > 0
        ? `Үлдсэн үнэгүй асуулт: ${remaining}`
        : "Үнэгүй асуулт дууссан",
    exhaustedLabel:
      "Хязгаар дуусмагц төлбөртэй иргэний багц идэвхжүүлнэ. Тодруулга нэмж тооцогдохгүй.",
  });
}

async function paidPlanSnapshot(
  userId: string,
  deps: {
    subscriptionRepository: SubscriptionRepository;
    entitlementUsageRepository: EntitlementUsageRepository;
  },
  at: Date,
  audience: "paid_citizen" | "lawyer",
): Promise<LegalQuestionEntitlementSnapshot> {
  const seated = await deps.subscriptionRepository.findActiveSeatForUser(userId);
  const owned =
    seated?.subscription ??
    (await deps.subscriptionRepository.findActiveOwnedByUserId(userId));
  if (!owned || !isSubscriptionActive(owned, at)) {
    return copySnapshot({
      audience,
      planName: null,
      remainingLegalQuestions: 0,
      remainingKind: "plan_quota",
      exhaustedNextStep: "billing",
      statusLabel: "Төлбөртэй багц",
      remainingLabel: "Үлдсэн хууль зүйн AI асуулт: 0",
      exhaustedLabel: "Багц идэвхгүй байна. Төлбөр төлж идэвхжүүлнэ үү.",
    });
  }

  const entitlement = resolveLawyerEntitlement(owned, at);
  const usage = await deps.entitlementUsageRepository.getOrCreate({
    userId,
    subscriptionId: owned.id,
    periodStart: entitlement.periodStart,
  });
  const remaining = Math.max(
    0,
    entitlement.quotas.legalAiQueries - (usage.legalAiQueryCount ?? 0),
  );
  const plan = getPlanDefinition(owned.planCode);
  const remainingMs = owned.currentPeriodEnd.getTime() - at.getTime();
  const expiresSoon =
    remainingMs > 0 && remainingMs <= SUBSCRIPTION_EXPIRY_WARNING_MS;
  return copySnapshot({
    audience,
    planName: plan.name,
    remainingLegalQuestions: remaining,
    remainingKind: "plan_quota",
    exhaustedNextStep: remaining > 0 ? "wait_period" : "wait_period",
    statusLabel: plan.name,
    remainingLabel: `Энэ сард үлдсэн хууль зүйн AI асуулт: ${remaining}`,
    exhaustedLabel:
      "Хязгаар дуусмагц дараагийн төлбөрийн үе хүртэл шинэ хууль зүйн асуулт асуух боломжгүй.",
    currentPeriodEnd: owned.currentPeriodEnd.toISOString(),
    expiresSoon,
    expiryWarningLabel: expiresSoon
      ? "Багц 3 хоногийн дотор дуусна. Сунгахын тулд төлбөр төлнө үү."
      : null,
  });
}

type SnapshotInput = Omit<
  LegalQuestionEntitlementSnapshot,
  "currentPeriodEnd" | "expiresSoon" | "expiryWarningLabel"
> & {
  currentPeriodEnd?: string | null;
  expiresSoon?: boolean;
  expiryWarningLabel?: string | null;
};

function copySnapshot(snapshot: SnapshotInput): LegalQuestionEntitlementSnapshot {
  return {
    ...snapshot,
    currentPeriodEnd: snapshot.currentPeriodEnd ?? null,
    expiresSoon: snapshot.expiresSoon ?? false,
    expiryWarningLabel: snapshot.expiryWarningLabel ?? null,
  };
}
