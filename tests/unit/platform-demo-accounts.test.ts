import { describe, expect, it } from "vitest";

import { createLegalQuestionAccess } from "@/application/legal-ai/legal-question-access";
import { ensurePlatformDemoSubscription } from "@/application/use-cases/entitlements/ensure-platform-demo-subscription";
import {
  PLATFORM_DEMO_PROVIDER_INVOICE_ID,
  isPlatformDemoEmail,
} from "@/domain/constants/platform-demo-accounts";
import { SubscriptionStatus, UserRole, UserStatus } from "@/domain/enums";
import type { User } from "@/domain/entities/user";
import { InMemoryEntitlementUsageRepository } from "@/infrastructure/repositories/in-memory-entitlement-usage-repository";
import { InMemorySubscriptionRepository } from "@/infrastructure/repositories/in-memory-subscription-repository";

function demoUser(overrides?: Partial<User>): User {
  const now = new Date();
  return {
    id: "demo-user-1",
    email: "beadyduk@gmail.com",
    emailVerified: now,
    name: "Founder",
    image: null,
    role: UserRole.CLIENT,
    status: UserStatus.ACTIVE,
    preferredLanguage: "mn",
    personalTenantId: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("platform demo accounts", () => {
  it("recognizes only the founder emails", () => {
    expect(isPlatformDemoEmail("beadyduk@gmail.com")).toBe(true);
    expect(isPlatformDemoEmail("E.Dulguun@ymail.com")).toBe(true);
    expect(isPlatformDemoEmail("other@gmail.com")).toBe(false);
  });

  it("provisions an active citizen plan without checkout", async () => {
    const user = demoUser();
    const subscriptions = new InMemorySubscriptionRepository();
    const created = await ensurePlatformDemoSubscription(
      { userId: user.id, role: UserRole.CLIENT },
      {
        userRepository: { findById: async () => user },
        subscriptionRepository: subscriptions,
      },
    );

    expect(created?.status).toBe(SubscriptionStatus.ACTIVE);
    expect(created?.providerInvoiceId).toBe(PLATFORM_DEMO_PROVIDER_INVOICE_ID);
    expect(created?.planCode).toBe("CITIZEN_PLUS");
  });

  it("lets a demo citizen start legal questions without billing", async () => {
    const user = demoUser();
    const subscriptions = new InMemorySubscriptionRepository();
    const access = createLegalQuestionAccess({
      guestSessions: {
        getById: async () => null,
        incrementFreeLegalQuestionsUsed: async () => {},
      },
      conversations: { countBilledQuestionsForUser: async () => 99 },
      subscriptionRepository: subscriptions,
      entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
      userRepository: { findById: async () => user },
    });

    await expect(
      access.assertCanStartNewLegalQuestion({
        kind: "user",
        userId: user.id,
        role: UserRole.CLIENT,
      }),
    ).resolves.toBeUndefined();
    await expect(
      access.hasPaidLegalAiAccess({
        kind: "user",
        userId: user.id,
        role: UserRole.CLIENT,
      }),
    ).resolves.toBe(true);
  });
});
