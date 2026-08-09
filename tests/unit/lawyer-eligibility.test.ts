import { describe, expect, it } from "vitest";

import type { LawyerProfile } from "@/domain/entities/profile";
import { LawyerVerificationStatus } from "@/domain/enums";
import {
  canClientBookLawyer,
  isLawyerPubliclyListed,
  isLawyerVerified,
} from "@/domain/services/lawyer-eligibility";

function profile(
  overrides: Partial<LawyerProfile> = {},
): LawyerProfile {
  const now = new Date();
  return {
    id: "p1",
    userId: "u1",
    slug: "ada",
    headline: null,
    bio: null,
    yearsOfExperience: null,
    verificationStatus: LawyerVerificationStatus.APPROVED,
    verifiedAt: now,
    isListed: true,
    averageRating: null,
    reviewCount: 0,
    timezone: "Asia/Ulaanbaatar",
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("lawyer listing eligibility", () => {
  it("requires verification, listing flag, and an active offering", () => {
    const p = profile();
    expect(isLawyerVerified(p)).toBe(true);
    expect(isLawyerPubliclyListed(p, true)).toBe(true);
    expect(isLawyerPubliclyListed(p, false)).toBe(false);
    expect(canClientBookLawyer(p, false)).toBe(false);
  });

  it("rejects unlisted or unverified lawyers", () => {
    expect(
      isLawyerPubliclyListed(
        profile({ isListed: false }),
        true,
      ),
    ).toBe(false);
    expect(
      isLawyerPubliclyListed(
        profile({ verificationStatus: LawyerVerificationStatus.PENDING }),
        true,
      ),
    ).toBe(false);
  });
});
