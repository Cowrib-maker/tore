import { describe, expect, it } from "vitest";

import { createLegalQuestionAccess, getLegalQuestionEntitlementSnapshot } from "@/application/legal-ai/legal-question-access";
import { SOLO_PLAN } from "@/domain/constants/subscription-plans";
import {
  EntitlementFeature,
  SeatStatus,
  SubscriptionPlanCode,
  SubscriptionStatus,
  UserRole,
} from "@/domain/enums";
import { EntitlementError } from "@/domain/errors/entitlement-error";
import { InMemoryEntitlementUsageRepository } from "@/infrastructure/repositories/in-memory-entitlement-usage-repository";
import { InMemorySubscriptionRepository } from "@/infrastructure/repositories/in-memory-subscription-repository";

function futureDate() {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

describe("createLegalQuestionAccess", () => {
  it("allows a guest first legal question and consumes the free thread", async () => {
    const guests = new Map([
      [
        "g1",
        {
          id: "g1",
          freeLegalQuestionsUsed: 0,
          expiresAt: futureDate(),
        },
      ],
    ]);
    const access = createLegalQuestionAccess({
      guestSessions: {
        getById: async (id) => guests.get(id) ?? null,
        incrementFreeLegalQuestionsUsed: async (id) => {
          const row = guests.get(id);
          if (row) row.freeLegalQuestionsUsed += 1;
        },
      },
      conversations: { countBilledQuestionsForUser: async () => 0 },
      subscriptionRepository: new InMemorySubscriptionRepository(),
      entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
    });

    await expect(
      access.assertCanStartNewLegalQuestion({
        kind: "guest",
        guestSessionId: "g1",
      }),
    ).resolves.toBeUndefined();
    await access.consumeNewLegalQuestion({
      kind: "guest",
      guestSessionId: "g1",
    });
    expect(guests.get("g1")?.freeLegalQuestionsUsed).toBe(1);
  });

  it("gates a guest new question after the free thread is used", async () => {
    const access = createLegalQuestionAccess({
      guestSessions: {
        getById: async () => ({
          id: "g1",
          freeLegalQuestionsUsed: 1,
          expiresAt: futureDate(),
        }),
        incrementFreeLegalQuestionsUsed: async () => {},
      },
      conversations: { countBilledQuestionsForUser: async () => 0 },
      subscriptionRepository: new InMemorySubscriptionRepository(),
      entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
    });

    await expect(
      access.assertCanStartNewLegalQuestion({
        kind: "guest",
        guestSessionId: "g1",
      }),
    ).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      statusCode: 401,
    });
  });

  it("allows one unpaid citizen thread then requires billing", async () => {
    const access = createLegalQuestionAccess({
      guestSessions: {
        getById: async () => null,
        incrementFreeLegalQuestionsUsed: async () => {},
      },
      conversations: { countBilledQuestionsForUser: async () => 1 },
      subscriptionRepository: new InMemorySubscriptionRepository(),
      entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
    });

    await expect(
      access.assertCanStartNewLegalQuestion({
        kind: "user",
        userId: "client-1",
        role: UserRole.CLIENT,
      }),
    ).rejects.toBeInstanceOf(EntitlementError);
    await expect(
      access.assertCanStartNewLegalQuestion({
        kind: "user",
        userId: "client-1",
        role: UserRole.CLIENT,
      }),
    ).rejects.toMatchObject({ code: "BILLING_REQUIRED", statusCode: 402 });
  });

  it("allows a paid citizen new question within catalog quota", async () => {
    const subscriptions = new InMemorySubscriptionRepository();
    const usage = new InMemoryEntitlementUsageRepository();
    const created = await subscriptions.create({
      ownerUserId: "client-1",
      planCode: SubscriptionPlanCode.CITIZEN_BASIC,
      status: SubscriptionStatus.ACTIVE,
      seatLimit: 1,
      currentPeriodStart: new Date(),
      currentPeriodEnd: futureDate(),
    });
    await subscriptions.createSeat({
      subscriptionId: created.id,
      userId: "client-1",
      status: SeatStatus.ACTIVE,
    });
    const access = createLegalQuestionAccess({
      guestSessions: {
        getById: async () => null,
        incrementFreeLegalQuestionsUsed: async () => {},
      },
      conversations: { countBilledQuestionsForUser: async () => 8 },
      subscriptionRepository: subscriptions,
      entitlementUsageRepository: usage,
    });

    await expect(
      access.assertCanStartNewLegalQuestion({
        kind: "user",
        userId: "client-1",
        role: UserRole.CLIENT,
      }),
    ).resolves.toBeUndefined();
    await access.consumeNewLegalQuestion({
      kind: "user",
      userId: "client-1",
      role: UserRole.CLIENT,
    });
    const row = await usage.getOrCreate({
      userId: "client-1",
      subscriptionId: created.id,
      periodStart: new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
      ),
    });
    expect(row.legalAiQueryCount).toBe(1);
    await expect(
      access.hasPaidLegalAiAccess({
        kind: "user",
        userId: "client-1",
        role: UserRole.CLIENT,
      }),
    ).resolves.toBe(true);
  });

  it("treats guests and unpaid citizens as unpaid for general questions", async () => {
    const access = createLegalQuestionAccess({
      guestSessions: {
        getById: async () => ({
          id: "g1",
          freeLegalQuestionsUsed: 0,
          expiresAt: futureDate(),
        }),
        incrementFreeLegalQuestionsUsed: async () => {},
      },
      conversations: { countBilledQuestionsForUser: async () => 0 },
      subscriptionRepository: new InMemorySubscriptionRepository(),
      entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
    });

    await expect(
      access.hasPaidLegalAiAccess({
        kind: "guest",
        guestSessionId: "g1",
      }),
    ).resolves.toBe(false);
    await expect(
      access.hasPaidLegalAiAccess({
        kind: "user",
        userId: "client-1",
        role: UserRole.CLIENT,
      }),
    ).resolves.toBe(false);
  });

  it("enforces lawyer SOLO LEGAL_AI_QUERY quota only for new questions", async () => {
    const subscriptions = new InMemorySubscriptionRepository();
    const usageRepo = new InMemoryEntitlementUsageRepository();
    const created = await subscriptions.create({
      ownerUserId: "lawyer-1",
      planCode: SubscriptionPlanCode.SOLO,
      status: SubscriptionStatus.ACTIVE,
      seatLimit: 1,
      currentPeriodStart: new Date(),
      currentPeriodEnd: futureDate(),
    });
    await subscriptions.createSeat({
      subscriptionId: created.id,
      userId: "lawyer-1",
      status: SeatStatus.ACTIVE,
    });
    const periodStart = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
    );
    const usage = await usageRepo.getOrCreate({
      userId: "lawyer-1",
      subscriptionId: created.id,
      periodStart,
    });
    await usageRepo.increment(usage.id, {
      legalAiQueryCount: SOLO_PLAN.quotas.legalAiQueries,
    });
    const access = createLegalQuestionAccess({
      guestSessions: {
        getById: async () => null,
        incrementFreeLegalQuestionsUsed: async () => {},
      },
      conversations: { countBilledQuestionsForUser: async () => 0 },
      subscriptionRepository: subscriptions,
      entitlementUsageRepository: usageRepo,
    });

    await expect(
      access.assertCanStartNewLegalQuestion({
        kind: "user",
        userId: "lawyer-1",
        role: UserRole.LAWYER,
      }),
    ).rejects.toMatchObject({ code: "FEATURE_QUOTA_EXCEEDED" });
    expect(EntitlementFeature.LEGAL_AI_QUERY).toBe("LEGAL_AI_QUERY");
  });

  it("reports guest remaining threads from server snapshot", async () => {
    const snapshot = await getLegalQuestionEntitlementSnapshot(
      { kind: "anonymous" },
      {
        guestSessions: {
          getById: async () => null,
          incrementFreeLegalQuestionsUsed: async () => {},
        },
        conversations: { countBilledQuestionsForUser: async () => 0 },
        subscriptionRepository: new InMemorySubscriptionRepository(),
        entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
      },
    );
    expect(snapshot.audience).toBe("guest");
    expect(snapshot.remainingKind).toBe("guest_free");
    expect(snapshot.remainingLegalQuestions).toBe(1);
    expect(snapshot.exhaustedNextStep).toBe("login");
    expect(snapshot.remainingLabel).toContain("1");
    expect(snapshot.expiresSoon).toBe(false);
    expect(snapshot.currentPeriodEnd).toBeNull();
  });

  it("warns when a paid plan ends within three days", async () => {
    const subscriptions = new InMemorySubscriptionRepository();
    const created = await subscriptions.create({
      ownerUserId: "lawyer-1",
      planCode: SubscriptionPlanCode.SOLO,
      status: SubscriptionStatus.ACTIVE,
      seatLimit: 1,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    });
    await subscriptions.createSeat({
      subscriptionId: created.id,
      userId: "lawyer-1",
      status: SeatStatus.ACTIVE,
    });
    const snapshot = await getLegalQuestionEntitlementSnapshot(
      { kind: "user", userId: "lawyer-1", role: UserRole.LAWYER },
      {
        guestSessions: {
          getById: async () => null,
          incrementFreeLegalQuestionsUsed: async () => {},
        },
        conversations: { countBilledQuestionsForUser: async () => 0 },
        subscriptionRepository: subscriptions,
        entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
      },
    );
    expect(snapshot.expiresSoon).toBe(true);
    expect(snapshot.expiryWarningLabel).toContain("3 хоног");
  });
});
