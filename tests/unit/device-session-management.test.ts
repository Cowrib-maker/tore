import { beforeEach, describe, expect, it } from "vitest";

import type { ActorContext } from "@/application/common/actor-context";
import { hashIpAddress } from "@/application/common/hash-ip";
import { DEFAULT_SESSION_PROTECTION_POLICY } from "@/domain/constants/session-protection-policy";
import { ACCOUNT_SHARING_RESTRICTED_MESSAGE, SOLO_PLAN } from "@/domain/constants/subscription-plans";
import {
  EntitlementFeature,
  SeatStatus,
  SubscriptionPlanCode,
  SubscriptionStatus,
  UserRole,
} from "@/domain/enums";
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@/domain/errors/domain-error";
import { EntitlementError } from "@/domain/errors/entitlement-error";
import {
  assertLawyerAiOperation,
  consumeLawyerFeatureUsage,
} from "@/application/use-cases/entitlements/assert-lawyer-ai-operation";
import { assertLawyerEntitlementActor, requireActiveLawyerEntitlement } from "@/application/use-cases/entitlements/ensure-lawyer-solo-subscription";
import { addUtcCalendarMonth } from "@/domain/services/subscription-period";
import {
  listOwnDeviceSessions,
  revokeOtherDeviceSessions,
  revokeOwnDeviceSession,
} from "@/application/use-cases/sessions/manage-device-sessions";
import { touchDeviceSession } from "@/application/use-cases/sessions/touch-device-session";
import { InMemoryDeviceSessionRepository } from "@/infrastructure/repositories/in-memory-device-session-repository";
import { InMemoryEntitlementUsageRepository } from "@/infrastructure/repositories/in-memory-entitlement-usage-repository";
import { InMemorySubscriptionRepository } from "@/infrastructure/repositories/in-memory-subscription-repository";

const lawyer: ActorContext = { userId: "lawyer-a", role: UserRole.LAWYER };
const otherLawyer: ActorContext = { userId: "lawyer-b", role: UserRole.LAWYER };
const client: ActorContext = { userId: "client-1", role: UserRole.CLIENT };
const now = new Date("2026-08-22T04:00:00.000Z");
const policy = DEFAULT_SESSION_PROTECTION_POLICY;

describe("lawyer device sessions and entitlements", () => {
  let subscriptions: InMemorySubscriptionRepository;
  let sessions: InMemoryDeviceSessionRepository;
  let usage: InMemoryEntitlementUsageRepository;

  beforeEach(() => {
    subscriptions = new InMemorySubscriptionRepository();
    sessions = new InMemoryDeviceSessionRepository();
    usage = new InMemoryEntitlementUsageRepository();
  });

  function deps() {
    return {
      subscriptionRepository: subscriptions,
      deviceSessionRepository: sessions,
      entitlementUsageRepository: usage,
    };
  }

  async function grantActiveSolo(userId: string, at: Date = now) {
    const created = await subscriptions.create({
      ownerUserId: userId,
      planCode: SubscriptionPlanCode.SOLO,
      status: SubscriptionStatus.ACTIVE,
      seatLimit: SOLO_PLAN.seatLimit,
      currentPeriodStart: at,
      currentPeriodEnd: addUtcCalendarMonth(at),
    });
    await subscriptions.createSeat({
      subscriptionId: created.id,
      userId,
      status: SeatStatus.ACTIVE,
    });
    return created;
  }

  it("does not auto-provision ACTIVE SOLO on first protected use", async () => {
    await expect(
      requireActiveLawyerEntitlement(lawyer, deps(), now),
    ).rejects.toMatchObject({
      code: "BILLING_REQUIRED",
    });
    expect(await subscriptions.findLatestOwnedByUserId(lawyer.userId)).toBeNull();
  });

  it("lets one lawyer use multiple legitimate devices", async () => {
    const subscription = await grantActiveSolo(lawyer.userId);
    const phone = await touchDeviceSession(
      {
        userId: lawyer.userId,
        subscriptionId: subscription.id,
        userAgent: "Mozilla/5.0 iPhone",
        now,
        policy,
      },
      deps(),
    );
    const laptop = await touchDeviceSession(
      {
        userId: lawyer.userId,
        subscriptionId: subscription.id,
        userAgent: "Mozilla/5.0 Chrome Windows",
        now,
        policy,
      },
      deps(),
    );
    expect(phone.id).not.toBe(laptop.id);
    const listed = await listOwnDeviceSessions(lawyer, laptop.id, deps());
    expect(listed).toHaveLength(2);
    expect(listed.filter((row) => row.isCurrent)).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
  });

  it("refreshes the same cookie as the same session", async () => {
    const subscription = await grantActiveSolo(lawyer.userId);
    const first = await touchDeviceSession(
      {
        userId: lawyer.userId,
        subscriptionId: subscription.id,
        now,
        policy,
      },
      deps(),
    );
    const second = await touchDeviceSession(
      {
        userId: lawyer.userId,
        subscriptionId: subscription.id,
        sessionIdFromCookie: first.id,
        now: new Date(now.getTime() + 1_000),
        policy,
      },
      deps(),
    );
    expect(second.id).toBe(first.id);
    expect(second.requestCountInWindow).toBe(2);
  });

  it("does not auto-replace a revoked cookie", async () => {
    const subscription = await grantActiveSolo(lawyer.userId);
    const created = await touchDeviceSession(
      {
        userId: lawyer.userId,
        subscriptionId: subscription.id,
        now,
        policy,
      },
      deps(),
    );
    await revokeOwnDeviceSession(lawyer, created.id, deps(), now);
    await expect(
      touchDeviceSession(
        {
          userId: lawyer.userId,
          subscriptionId: subscription.id,
          sessionIdFromCookie: created.id,
          now,
          policy,
        },
        deps(),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("lists only the actor's sessions and revokes only their own", async () => {
    const a = { subscription: await grantActiveSolo(lawyer.userId) };
    const b = { subscription: await grantActiveSolo(otherLawyer.userId) };
    const mine = await touchDeviceSession(
      {
        userId: lawyer.userId,
        subscriptionId: a.subscription.id,
        now,
        policy,
      },
      deps(),
    );
    const theirs = await touchDeviceSession(
      {
        userId: otherLawyer.userId,
        subscriptionId: b.subscription.id,
        now,
        policy,
      },
      deps(),
    );

    const listed = await listOwnDeviceSessions(lawyer, mine.id, deps());
    expect(listed.map((row) => row.id)).toEqual([mine.id]);

    await expect(
      revokeOwnDeviceSession(lawyer, theirs.id, deps(), now),
    ).rejects.toBeInstanceOf(NotFoundError);

    await revokeOwnDeviceSession(otherLawyer, theirs.id, deps(), now);
    const remaining = await sessions.listActiveByUserId(otherLawyer.userId);
    expect(remaining).toHaveLength(0);
  });

  it("revokes all other sessions for the current lawyer", async () => {
    const subscription = await grantActiveSolo(lawyer.userId);
    const current = await touchDeviceSession(
      {
        userId: lawyer.userId,
        subscriptionId: subscription.id,
        now,
        policy,
      },
      deps(),
    );
    await touchDeviceSession(
      {
        userId: lawyer.userId,
        subscriptionId: subscription.id,
        now,
        policy,
      },
      deps(),
    );
    const revoked = await revokeOtherDeviceSessions(
      lawyer,
      current.id,
      deps(),
      now,
    );
    expect(revoked).toBe(1);
    const active = await sessions.listActiveByUserId(lawyer.userId);
    expect(active.map((row) => row.id)).toEqual([current.id]);
  });

  it("forbids clients from lawyer session and entitlement operations", async () => {
    expect(() => assertLawyerEntitlementActor(client)).toThrow(ForbiddenError);
    await expect(listOwnDeviceSessions(client, null, deps())).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      revokeOtherDeviceSessions(client, null, deps(), now),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      assertLawyerAiOperation(
        {
          actor: client,
          policy,
          feature: EntitlementFeature.LEGAL_AI_QUERY,
          now,
        },
        deps(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows normal SOLO usage under the concurrent-session threshold", async () => {
    await grantActiveSolo(lawyer.userId);
    const result = await assertLawyerAiOperation(
      {
        actor: lawyer,
        policy,
        feature: EntitlementFeature.CASE_ANALYSIS,
        userAgent: "Mozilla/5.0 Chrome",
        now,
      },
      deps(),
    );
    expect(result.risk.state).toBe("NORMAL");
    await consumeLawyerFeatureUsage(
      result.usageId,
      EntitlementFeature.CASE_ANALYSIS,
      deps(),
    );
    const ledger = await usage.getOrCreate({
      userId: lawyer.userId,
      periodStart: result.entitlement.periodStart,
    });
    expect(ledger.caseAnalysisCount).toBe(1);
  });

  it("can restrict expensive operations when HIGH_RISK policy is enabled", async () => {
    const subscription = await grantActiveSolo(lawyer.userId);
    for (const n of [1, 2, 3]) {
      await sessions.create({
        userId: lawyer.userId,
        subscriptionId: subscription.id,
        userAgent: `device-${n}`,
        ipHash: `ip-${n}`,
        firstSeenAt: now,
        lastSeenAt: now,
      });
    }
    await expect(
      assertLawyerAiOperation(
        {
          actor: lawyer,
          policy,
          feature: EntitlementFeature.LEGAL_AI_QUERY,
          userAgent: "device-4",
          ipHash: "ip-4",
          now,
        },
        deps(),
      ),
    ).rejects.toMatchObject({
      name: "EntitlementError",
      code: "ACCOUNT_SHARING_RESTRICTED",
      message: ACCOUNT_SHARING_RESTRICTED_MESSAGE,
    } satisfies Partial<EntitlementError>);
  });

  it("does not block HIGH_RISK when the configured policy disables restriction", async () => {
    const subscription = await grantActiveSolo(lawyer.userId);
    for (const n of [1, 2, 3]) {
      await sessions.create({
        userId: lawyer.userId,
        subscriptionId: subscription.id,
        userAgent: `device-${n}`,
        ipHash: `ip-${n}`,
        firstSeenAt: now,
        lastSeenAt: now,
      });
    }
    const result = await assertLawyerAiOperation(
      {
        actor: lawyer,
        policy: { ...policy, restrictExpensiveOpsOnHighRisk: false },
        feature: EntitlementFeature.LEGAL_AI_QUERY,
        userAgent: "device-4",
        ipHash: "ip-4",
        now,
      },
      deps(),
    );
    expect(result.risk.state).toBe("HIGH_RISK");
  });

  it("hashes IPs and never returns the raw address", () => {
    const hashed = hashIpAddress("203.0.113.10", "test-pepper");
    expect(hashed).toBe(hashIpAddress("203.0.113.10", "test-pepper"));
    expect(hashed).not.toContain("203.0.113.10");
    expect(hashIpAddress("", "test-pepper")).toBeNull();
  });
});
