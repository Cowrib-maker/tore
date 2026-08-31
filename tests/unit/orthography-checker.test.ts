import { describe, expect, it } from "vitest";

import { checkOrthographyForPaidUser } from "@/application/use-cases/orthography/check-orthography";
import {
  SeatStatus,
  SubscriptionPlanCode,
  SubscriptionStatus,
  UserRole,
} from "@/domain/enums";
import { EntitlementError } from "@/domain/errors/entitlement-error";
import { UnauthorizedError } from "@/domain/errors/domain-error";
import {
  applyFeminineYiFix,
  buildOrthographySuggestions,
  latinTokenToCyrillic,
  replaceSuggestedWord,
} from "@/domain/mongolian-orthography";
import { InMemoryEntitlementUsageRepository } from "@/infrastructure/repositories/in-memory-entitlement-usage-repository";
import { InMemorySubscriptionRepository } from "@/infrastructure/repositories/in-memory-subscription-repository";

function futureDate() {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

describe("orthography suggestions (suggest-only)", () => {
  it("suggests a concrete §10 variant without rewriting the whole text", () => {
    expect(applyFeminineYiFix("хүны")).toBe("хүний");
    const result = buildOrthographySuggestions("Хүны эрх.");
    expect(result.suggestionCount).toBe(1);
    expect(result.suggestions[0]).toMatchObject({
      kind: "ORTHOGRAPHY",
      sourceWord: "хүны",
      suggestedWord: "хүний",
    });
    expect(
      replaceSuggestedWord("Хүны эрх.", "хүны", "хүний"),
    ).toBe("хүний эрх.");
  });

  it("stays silent for correct words and for harmony without a known fix", () => {
    expect(buildOrthographySuggestions("бодлого зөв байна.").suggestionCount).toBe(
      0,
    );
    expect(buildOrthographySuggestions("авдэр").suggestionCount).toBe(0);
  });

  it("offers Latin→Cyrillic only when opted in", () => {
    const off = buildOrthographySuggestions("hu'nii erh", {
      includeLatinToCyrillic: false,
    });
    expect(off.latinCount).toBe(0);

    const on = buildOrthographySuggestions("hu'nii erh", {
      includeLatinToCyrillic: true,
    });
    expect(on.latinCount).toBeGreaterThan(0);
    expect(latinTokenToCyrillic("hu'nii")).toBe("хүний");
    expect(latinTokenToCyrillic("hünii")).toBe("хүний");
    expect(latinTokenToCyrillic("erh")).toBe("эрх");
    expect(on.suggestions.some((item) => item.kind === "LATIN_TO_CYRILLIC")).toBe(
      true,
    );
  });
});

describe("checkOrthographyForPaidUser", () => {
  it("rejects anonymous callers", async () => {
    await expect(
      checkOrthographyForPaidUser(
        null,
        { text: "текст" },
        {
          subscriptionRepository: new InMemorySubscriptionRepository(),
          entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
          userRepository: { findById: async () => null },
        },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects unpaid citizens with BILLING_REQUIRED", async () => {
    await expect(
      checkOrthographyForPaidUser(
        { userId: "client-1", role: UserRole.CLIENT },
        { text: "Хүны эрх" },
        {
          subscriptionRepository: new InMemorySubscriptionRepository(),
          entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
          userRepository: { findById: async () => null },
        },
      ),
    ).rejects.toMatchObject({
      code: "BILLING_REQUIRED",
      statusCode: 402,
    } satisfies Partial<EntitlementError>);
  });

  it("returns suggestions only — no correctedText auto-rewrite", async () => {
    const subscriptions = new InMemorySubscriptionRepository();
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

    const result = await checkOrthographyForPaidUser(
      { userId: "client-1", role: UserRole.CLIENT },
      { text: "Хүны эрх" },
      {
        subscriptionRepository: subscriptions,
        entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
        userRepository: { findById: async () => null },
      },
    );

    expect(result.premium).toBe(true);
    expect(result.suggestionCount).toBeGreaterThan(0);
    expect(result.suggestions[0]?.suggestedWord).toBe("хүний");
    expect(result).not.toHaveProperty("correctedText");
  });
});
