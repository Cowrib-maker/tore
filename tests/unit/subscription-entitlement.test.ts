import { describe, expect, it } from "vitest";

import { SOLO_PLAN, TEAM_PLAN, TOKEN_CEILING_USER_MESSAGE } from "@/domain/constants/subscription-plans";
import type { EntitlementUsage, Subscription } from "@/domain/entities/subscription";
import {
  EntitlementFeature,
  SubscriptionPlanCode,
  SubscriptionStatus,
} from "@/domain/enums";
import {
  evaluateFeatureQuota,
  isSubscriptionActive,
  resolveLawyerEntitlement,
  toPublicUsageSnapshot,
} from "@/domain/services/entitlement";

const now = new Date("2026-08-22T12:00:00.000Z");

function subscription(
  overrides: Partial<Subscription> = {},
): Subscription {
  return {
    id: "sub-1",
    ownerUserId: "lawyer-1",
    planCode: SubscriptionPlanCode.SOLO,
    status: SubscriptionStatus.ACTIVE,
    seatLimit: 1,
    currentPeriodStart: new Date("2026-08-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z"),
    providerInvoiceId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("subscription entitlements", () => {
  it("keeps the current SOLO commercial plan", () => {
    expect(SOLO_PLAN.priceMnt).toBe(49_000);
    expect(SOLO_PLAN.seatLimit).toBe(1);
    expect(SOLO_PLAN.quotas.caseAnalysis).toBe(30);
    expect(SOLO_PLAN.quotas.documentAnalysis).toBe(100);
    expect(SOLO_PLAN.quotas.legalAiQueries).toBe(500);
    expect(SOLO_PLAN.tokenCeilings.inputTokens).toBe(1_000_000);
    expect(SOLO_PLAN.tokenCeilings.outputTokens).toBe(200_000);
  });

  it("resolves SOLO seatLimit = 1 from the server-side catalog", () => {
    const entitlement = resolveLawyerEntitlement(subscription(), now);
    expect(entitlement.planCode).toBe(SubscriptionPlanCode.SOLO);
    expect(entitlement.seatLimit).toBe(1);
    expect(entitlement.quotas.legalAiQueries).toBe(500);
  });

  it("allows a future TEAM subscription to have seatLimit greater than 1", () => {
    const entitlement = resolveLawyerEntitlement(
      subscription({
        planCode: SubscriptionPlanCode.TEAM,
        seatLimit: TEAM_PLAN.seatLimit,
      }),
      now,
    );
    expect(entitlement.planCode).toBe(SubscriptionPlanCode.TEAM);
    expect(entitlement.seatLimit).toBeGreaterThan(1);
    expect(entitlement.seatLimit).toBe(5);
  });

  it("treats subscription status as server-authoritative", () => {
    expect(isSubscriptionActive(subscription(), now)).toBe(true);
    expect(
      isSubscriptionActive(
        subscription({ status: SubscriptionStatus.CANCELED }),
        now,
      ),
    ).toBe(false);
    expect(
      isSubscriptionActive(
        subscription({ status: SubscriptionStatus.PENDING }),
        now,
      ),
    ).toBe(false);
    expect(
      isSubscriptionActive(
        subscription({ currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z") }),
        now,
      ),
    ).toBe(false);
  });

  it("does not expose token fields on the public usage snapshot", () => {
    const usage: Pick<
      EntitlementUsage,
      "caseAnalysisCount" | "documentAnalysisCount" | "legalAiQueryCount"
    > = {
      caseAnalysisCount: 2,
      documentAnalysisCount: 4,
      legalAiQueryCount: 9,
    };
    const snapshot = toPublicUsageSnapshot(
      resolveLawyerEntitlement(subscription(), now),
      usage,
    );
    expect(snapshot).toEqual({
      caseAnalysis: { used: 2, limit: 30 },
      documentAnalysis: { used: 4, limit: 100 },
      legalAiQueries: { used: 9, limit: 500 },
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/token/i);
  });

  it("returns a generic token-ceiling message without numbers", () => {
    const decision = evaluateFeatureQuota({
      feature: EntitlementFeature.LEGAL_AI_QUERY,
      entitlement: resolveLawyerEntitlement(subscription(), now),
      usage: {
        caseAnalysisCount: 0,
        documentAnalysisCount: 0,
        legalAiQueryCount: 0,
        inputTokens: 1_000_000,
        outputTokens: 0,
      },
    });
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.kind).toBe("TOKEN");
    expect(decision.message).toBe(TOKEN_CEILING_USER_MESSAGE);
    expect(decision.message).not.toMatch(/\d/);
  });

  it("blocks a feature when its monthly quota is exhausted", () => {
    const decision = evaluateFeatureQuota({
      feature: EntitlementFeature.LEGAL_AI_QUERY,
      entitlement: resolveLawyerEntitlement(subscription(), now),
      usage: {
        caseAnalysisCount: 0,
        documentAnalysisCount: 0,
        legalAiQueryCount: 500,
        inputTokens: 0,
        outputTokens: 0,
      },
    });
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.kind).toBe("FEATURE");
    expect(decision.message).toContain("TORE Team");
  });
});
