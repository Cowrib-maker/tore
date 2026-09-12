import {
  CITIZEN_BILLING_REQUIRED_MESSAGE,
  CITIZEN_PLANS,
  FEATURE_QUOTA_EXCEEDED_MESSAGES,
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
import type { UnpaidCitizenLegalQuestionUsageRepository } from "@/domain/repositories/unpaid-citizen-legal-question-usage-repository";
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

/**
 * Identity of an atomic quota reservation made by
 * `assertCanStartNewLegalQuestion`, threaded through the caller
 * (legal-ai.service.ts) and back to `releaseNewLegalQuestion` if the turn
 * it authorized ultimately fails.
 *
 * This carries the EXACT row that was incremented, not the subject that
 * requested it, and release must act on this identity alone — never
 * re-derive "which row" from current subscription/seat/period state.
 * Re-deriving was a real bug: a subscription's active seat/period can
 * change between reserve and release (most concretely, a UTC-month
 * boundary landing between the two), which could make a release target a
 * different EntitlementUsage row than the one actually reserved, leaking
 * one unit of quota. Carrying the id closes that instead of narrowing it.
 */
export type LegalQuestionReservation =
  | { kind: "none" }
  | { kind: "guest"; guestSessionId: string }
  | { kind: "entitlement_usage"; usageId: string }
  | { kind: "unpaid_citizen"; userId: string };

export type LegalQuestionAccessPort = {
  assertCanStartNewLegalQuestion(
    subject: LegalQuestionSubject,
  ): Promise<LegalQuestionReservation>;
  consumeNewLegalQuestion(subject: LegalQuestionSubject): Promise<void>;
  /**
   * Compensates a reservation made by `assertCanStartNewLegalQuestion` when
   * the turn that reservation authorized ultimately fails (AI error,
   * persistence failure, etc.) — see the note on that method for why the
   * reservation happens up front instead of after a successful reply.
   * Takes the reservation returned by assert, not the subject — see
   * `LegalQuestionReservation`'s doc for why.
   */
  releaseNewLegalQuestion(reservation: LegalQuestionReservation): Promise<void>;
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
  /**
   * Atomically increments `freeLegalQuestionsUsed` by 1 only if the guest
   * session exists, has not expired, and is currently below `limit`.
   * Returns whether the free question was reserved — a single boolean
   * covers both "no such session / expired" and "already exhausted"
   * since both cases produce the identical AUTHENTICATION_REQUIRED
   * response today. This is the race-safe replacement for the previous
   * separate "read session, compare, increment later" sequence.
   */
  tryConsumeFreeLegalQuestion(
    id: string,
    limit: number,
    now: Date,
  ): Promise<boolean>;
  /** Compensating decrement — see `LegalQuestionAccessPort.releaseNewLegalQuestion`. */
  releaseFreeLegalQuestion(id: string): Promise<void>;
};

export type ConversationBillingStore = {
  countBilledQuestionsForUser(userId: string): Promise<number>;
};

type LegalQuestionAccessDeps = {
  guestSessions: GuestSessionStore;
  conversations: ConversationBillingStore;
  subscriptionRepository: SubscriptionRepository;
  entitlementUsageRepository: EntitlementUsageRepository;
  unpaidCitizenUsage: UnpaidCitizenLegalQuestionUsageRepository;
  userRepository?: Pick<UserRepository, "findById">;
  now?: () => Date;
};

export function allowAllLegalQuestionAccess(): LegalQuestionAccessPort {
  return {
    async assertCanStartNewLegalQuestion() {
      return { kind: "none" };
    },
    async consumeNewLegalQuestion() {},
    async releaseNewLegalQuestion() {},
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
    // All three subject kinds now reserve atomically, right here, via a
    // single conditional DB write — rather than checking here and
    // consuming later in consumeNewLegalQuestion. That two-call gap
    // (check → ... → consume) was the P0-3 race: two concurrent requests
    // could each pass the check before either consumed, both proceed to
    // a real (billable) AI call, and both consume — exceeding the quota
    // by as many requests as were racing. Reserving here, atomically,
    // closes that window for all three: guest (GuestSession row), paid
    // lawyer/citizen (EntitlementUsage row), and unpaid citizen
    // (UnpaidCitizenLegalQuestionUsage row — a lifetime counter, never
    // period-resetting, deliberately not folded into EntitlementUsage;
    // see that model's own schema comment). If the turn this reservation
    // authorized later fails, releaseNewLegalQuestion below compensates
    // so a failed AI call still never permanently consumes quota
    // (unchanged from the pre-existing behavior).
    async assertCanStartNewLegalQuestion(subject) {
      if (subject.kind === "guest") {
        const reserved = await deps.guestSessions.tryConsumeFreeLegalQuestion(
          subject.guestSessionId,
          GUEST_FREE_LEGAL_QUESTIONS,
          now(),
        );
        if (!reserved) {
          throw new EntitlementError(
            LEGAL_AI_AUTHENTICATION_REQUIRED_MESSAGE,
            "AUTHENTICATION_REQUIRED",
            401,
          );
        }
        return { kind: "guest", guestSessionId: subject.guestSessionId };
      }

      if (await isDemoSubject(subject, deps, now())) {
        return { kind: "none" };
      }

      if (subject.role === UserRole.LAWYER) {
        const usageId = await reservePaidLegalAiQuota(
          subject.userId,
          deps,
          now(),
          BILLING_REQUIRED_MESSAGE,
        );
        return { kind: "entitlement_usage", usageId };
      }

      const paid = await findActiveCitizenSubscription(
        subject.userId,
        deps.subscriptionRepository,
        now(),
      );
      if (paid) {
        const usageId = await reservePaidLegalAiQuota(
          subject.userId,
          deps,
          now(),
          CITIZEN_BILLING_REQUIRED_MESSAGE,
        );
        return { kind: "entitlement_usage", usageId };
      }

      const reserved = await deps.unpaidCitizenUsage.tryReserve(
        subject.userId,
        UNPAID_CITIZEN_FREE_LEGAL_QUESTIONS,
      );
      if (!reserved) {
        throw new EntitlementError(
          CITIZEN_BILLING_REQUIRED_MESSAGE,
          "BILLING_REQUIRED",
          402,
        );
      }
      return { kind: "unpaid_citizen", userId: subject.userId };
    },

    // Quota for all three subject kinds is already reserved by
    // assertCanStartNewLegalQuestion above; this is an intentional no-op.
    // AIConversation.billedQuestionCount is still written by the caller
    // (legal-ai.service.ts, via updateQuestionThread's
    // incrementBilledQuestion flag) on success, purely as a
    // historical/audit trail — it is no longer read as an enforcement
    // gate anywhere.
    async consumeNewLegalQuestion() {},

    // Acts on the reservation identity returned by
    // assertCanStartNewLegalQuestion — never re-derives "which row" from
    // current subject/subscription state. See LegalQuestionReservation's
    // doc comment for why that distinction matters.
    async releaseNewLegalQuestion(reservation) {
      switch (reservation.kind) {
        case "none":
          return;
        case "guest":
          await deps.guestSessions.releaseFreeLegalQuestion(
            reservation.guestSessionId,
          );
          return;
        case "entitlement_usage":
          await deps.entitlementUsageRepository.releaseLegalAiQuery(
            reservation.usageId,
          );
          return;
        case "unpaid_citizen":
          await deps.unpaidCitizenUsage.release(reservation.userId);
          return;
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

/**
 * Authorizes AND atomically reserves one LEGAL_AI_QUERY unit for a paid
 * (lawyer or paid-citizen) subject, in a single call.
 *
 * `evaluateFeatureQuota` is still used for its non-atomic reads (token
 * ceiling, and a first-pass feature-count check) so its exact, existing
 * error messages/kinds are reused verbatim — nothing about those messages
 * changes. But that read can be stale under concurrency, so a `ok: true`
 * verdict from it is NOT treated as final authorization: the actual
 * authorization boundary is `tryReserveLegalAiQuery`, an atomic
 * conditional `UPDATE ... WHERE legalAiQueryCount < limit` at the
 * database level. Only if that conditional update actually applies (i.e.
 * the row was still under the limit at write time, not just at the
 * earlier read time) is the caller authorized. This is what closes the
 * race: two concurrent requests can both see `ok: true` from the stale
 * read, but only one of them can win the atomic increment.
 *
 * Returns the reserved EntitlementUsage row's id so the caller can release
 * that EXACT row later if needed — never re-resolve subscription/seat/
 * period again at release time (see LegalQuestionReservation's doc for
 * why re-deriving is the bug this replaces).
 */
async function reservePaidLegalAiQuota(
  userId: string,
  deps: {
    subscriptionRepository: SubscriptionRepository;
    entitlementUsageRepository: EntitlementUsageRepository;
  },
  at: Date,
  billingMessage: string,
): Promise<string> {
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

  const reserved = await deps.entitlementUsageRepository.tryReserveLegalAiQuery(
    usage.id,
    entitlement.quotas.legalAiQueries,
  );
  if (!reserved) {
    throw new EntitlementError(
      FEATURE_QUOTA_EXCEEDED_MESSAGES[EntitlementFeature.LEGAL_AI_QUERY],
      "FEATURE_QUOTA_EXCEEDED",
    );
  }
  return usage.id;
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
    unpaidCitizenUsage: UnpaidCitizenLegalQuestionUsageRepository;
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

  const used = await deps.unpaidCitizenUsage.getUsedCount(subject.userId);
  const remaining = Math.max(
    0,
    UNPAID_CITIZEN_FREE_LEGAL_QUESTIONS - used,
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
