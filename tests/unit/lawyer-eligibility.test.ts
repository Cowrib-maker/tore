import { describe, expect, it } from "vitest";

import type { LawyerProfile } from "@/domain/entities/profile";
import { LawyerPosition, LawyerVerificationStatus } from "@/domain/enums";
import {
  canClientBookLawyer,
  canSubmitCredentials,
  isLawyerPubliclyListed,
  isLawyerVerified,
  isMarketplaceEligiblePosition,
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
    city: null,
    education: null,
    phone: null,
    verificationStatus: LawyerVerificationStatus.APPROVED,
    position: LawyerPosition.ATTORNEY,
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

  it("hides rejected and suspended lawyers from the public directory", () => {
    expect(
      isLawyerPubliclyListed(
        profile({ verificationStatus: LawyerVerificationStatus.REJECTED }),
        true,
      ),
    ).toBe(false);
    expect(
      isLawyerPubliclyListed(
        profile({ verificationStatus: LawyerVerificationStatus.SUSPENDED }),
        true,
      ),
    ).toBe(false);
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

  it("allows credential submission only while pending or rejected", () => {
    expect(canSubmitCredentials(profile({ verificationStatus: LawyerVerificationStatus.PENDING }))).toBe(true);
    expect(canSubmitCredentials(profile({ verificationStatus: LawyerVerificationStatus.REJECTED }))).toBe(true);
    expect(canSubmitCredentials(profile({ verificationStatus: LawyerVerificationStatus.APPROVED }))).toBe(false);
    expect(canSubmitCredentials(profile({ verificationStatus: LawyerVerificationStatus.SUSPENDED }))).toBe(false);
  });

  it("only the ATTORNEY position is marketplace-eligible", () => {
    expect(isMarketplaceEligiblePosition(profile({ position: LawyerPosition.ATTORNEY }))).toBe(true);
    expect(isMarketplaceEligiblePosition(profile({ position: LawyerPosition.PROSECUTOR }))).toBe(false);
    expect(isMarketplaceEligiblePosition(profile({ position: LawyerPosition.JUDGE }))).toBe(false);
    expect(isMarketplaceEligiblePosition(profile({ position: LawyerPosition.OTHER_LAWYER }))).toBe(false);
  });

  it("never publicly lists or allows booking for non-ATTORNEY positions, even if otherwise fully eligible", () => {
    const prosecutor = profile({ position: LawyerPosition.PROSECUTOR });
    expect(isLawyerPubliclyListed(prosecutor, true)).toBe(false);
    expect(canClientBookLawyer(prosecutor, true)).toBe(false);

    const judge = profile({ position: LawyerPosition.JUDGE });
    expect(isLawyerPubliclyListed(judge, true)).toBe(false);

    const otherLawyer = profile({ position: LawyerPosition.OTHER_LAWYER });
    expect(isLawyerPubliclyListed(otherLawyer, true)).toBe(false);

    // Sanity check: the same profile shape with ATTORNEY position is eligible,
    // proving the failures above are due to position and nothing else.
    expect(isLawyerPubliclyListed(profile({ position: LawyerPosition.ATTORNEY }), true)).toBe(true);
  });
});
