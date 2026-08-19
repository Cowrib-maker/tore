import { describe, expect, it } from "vitest";

import type { LawyerProfile } from "@/domain/entities/profile";
import { LawyerVerificationStatus } from "@/domain/enums";
import {
  canClientBookLawyer,
  canSubmitCredentials,
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
    city: null,
    education: null,
    phone: null,
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
});
