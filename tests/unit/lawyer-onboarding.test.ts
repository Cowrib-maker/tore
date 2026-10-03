import { describe, expect, it, vi } from "vitest";

import { reviewLawyerCredentialUseCase } from "@/application/use-cases/verification/review-lawyer-credential";
import { submitLawyerCredentialUseCase } from "@/application/use-cases/verification/submit-lawyer-credential";
import { updateLawyerProfileUseCase } from "@/application/use-cases/profiles/update-lawyer-profile";
import type { LawyerProfile } from "@/domain/entities/profile";
import {
  CredentialReviewStatus,
  LawyerPosition,
  LawyerVerificationStatus,
  UserRole,
} from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import { isLawyerPubliclyListed } from "@/domain/services/lawyer-eligibility";
import {
  computeLawyerOnboarding,
  isListedForDisplay,
  lawyerVerificationState,
} from "@/domain/services/lawyer-onboarding";

function profile(overrides: Partial<LawyerProfile> = {}): LawyerProfile {
  return {
    id: "lp1",
    userId: "u1",
    slug: "bat",
    headline: null,
    bio: null,
    yearsOfExperience: null,
    city: null,
    education: null,
    phone: null,
    verificationStatus: LawyerVerificationStatus.PENDING,
    position: LawyerPosition.ATTORNEY,
    verifiedAt: null,
    isListed: false,
    averageRating: null,
    reviewCount: 0,
    timezone: "Asia/Ulaanbaatar",
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const submitted = [{ status: CredentialReviewStatus.SUBMITTED }];

const empty = {
  credentials: [],
  hasPhoto: false,
  practiceAreaCount: 0,
  languageCount: 0,
  activeAvailabilityRuleCount: 0,
  hasActiveOffering: false,
};

describe("lawyer verification state", () => {
  it.each([
    ["PENDING, nothing submitted", LawyerVerificationStatus.PENDING, [], "SUBMIT_LICENSE"],
    ["PENDING, license submitted", LawyerVerificationStatus.PENDING, submitted, "UNDER_REVIEW"],
    ["REJECTED", LawyerVerificationStatus.REJECTED, submitted, "REJECTED"],
    ["SUSPENDED", LawyerVerificationStatus.SUSPENDED, [], "SUSPENDED"],
    ["APPROVED", LawyerVerificationStatus.APPROVED, [], "APPROVED"],
  ])("%s → %s", (_label, status, credentials, expected) => {
    expect(
      lawyerVerificationState({ verificationStatus: status }, credentials),
    ).toBe(expected);
  });
});

describe("computeLawyerOnboarding", () => {
  it("separates verification, public-listing and optional items", () => {
    const result = computeLawyerOnboarding({ ...empty, profile: profile() });
    expect(result.forVerification.map((i) => i.key)).toEqual(["license"]);
    expect(result.forPublicListing.map((i) => i.key)).toEqual([
      "approved",
      "offering",
      "optedIn",
    ]);
    expect(result.recommended.map((i) => i.key)).toContain("bio");
    expect(result.recommended.every((i) => !i.done)).toBe(true);
    expect(result.isPubliclyVisible).toBe(false);
  });

  it("marks only what is actually persisted as done", () => {
    const result = computeLawyerOnboarding({
      ...empty,
      profile: profile({ headline: "Counsel", bio: "  ", yearsOfExperience: 0 }),
      credentials: submitted,
      practiceAreaCount: 2,
      hasPhoto: true,
    });
    const done = (items: { key: string; done: boolean }[]) =>
      items.filter((i) => i.done).map((i) => i.key);
    expect(done(result.forVerification)).toEqual(["license"]);
    // blank bio is not "done"; 0 years is a real value and is.
    expect(done(result.recommended)).toEqual([
      "headline",
      "years",
      "photo",
      "practiceAreas",
    ]);
  });

  it.each([
    LawyerVerificationStatus.PENDING,
    LawyerVerificationStatus.REJECTED,
    LawyerVerificationStatus.SUSPENDED,
  ])("a %s lawyer is never publicly visible, even listed with an active offering", (status) => {
    const p = profile({ verificationStatus: status, isListed: true });
    expect(isLawyerPubliclyListed(p, true)).toBe(false);
    expect(
      computeLawyerOnboarding({ ...empty, profile: p, hasActiveOffering: true })
        .isPubliclyVisible,
    ).toBe(false);
  });

  it("APPROVED + opted in + active offering is visible; without an offering it is not", () => {
    const p = profile({
      verificationStatus: LawyerVerificationStatus.APPROVED,
      isListed: true,
    });
    expect(
      computeLawyerOnboarding({ ...empty, profile: p, hasActiveOffering: true })
        .isPubliclyVisible,
    ).toBe(true);
    expect(
      computeLawyerOnboarding({ ...empty, profile: p, hasActiveOffering: false })
        .isPubliclyVisible,
    ).toBe(false);
  });
});

describe("listed state shown to the lawyer", () => {
  it.each([
    [LawyerVerificationStatus.APPROVED, true, true],
    [LawyerVerificationStatus.APPROVED, false, false],
    [LawyerVerificationStatus.SUSPENDED, true, false],
    [LawyerVerificationStatus.REJECTED, true, false],
    [LawyerVerificationStatus.PENDING, true, false],
  ])("%s with isListed=%s displays listed=%s", (status, isListed, expected) => {
    expect(
      isListedForDisplay(profile({ verificationStatus: status, isListed })),
    ).toBe(expected);
  });

  it("a suspended lawyer with the flag still on is not shown as opted in or visible", () => {
    const suspended = profile({
      verificationStatus: LawyerVerificationStatus.SUSPENDED,
      isListed: true,
    });
    const result = computeLawyerOnboarding({
      ...empty,
      profile: suspended,
      hasActiveOffering: true,
    });
    expect(result.forPublicListing.find((i) => i.key === "optedIn")?.done).toBe(false);
    expect(result.forPublicListing.find((i) => i.key === "approved")?.done).toBe(false);
    expect(result.isPubliclyVisible).toBe(false);
    // The stored flag is not rewritten by presentation logic.
    expect(suspended.isListed).toBe(true);
  });

  it("an approved, opted-in lawyer with an active offering is unchanged", () => {
    const ok = profile({
      verificationStatus: LawyerVerificationStatus.APPROVED,
      isListed: true,
    });
    const result = computeLawyerOnboarding({ ...empty, profile: ok, hasActiveOffering: true });
    expect(result.forPublicListing.every((i) => i.done)).toBe(true);
    expect(result.isPubliclyVisible).toBe(true);
  });
});

describe("lawyer verification security", () => {
  const reviewInput = {
    credentialId: "c1",
    decision: CredentialReviewStatus.APPROVED,
  } as never;

  it.each([UserRole.LAWYER, UserRole.CLIENT])(
    "a %s cannot approve a credential (no self-approval)",
    async (role) => {
      const findById = vi.fn();
      const runInTransaction = vi.fn();
      await expect(
        reviewLawyerCredentialUseCase(
          { userId: "u1", role },
          reviewInput,
          {
            lawyerCredentialRepository: { findById } as never,
            unitOfWork: { runInTransaction } as never,
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(findById).not.toHaveBeenCalled();
      expect(runInTransaction).not.toHaveBeenCalled();
    },
  );

  it.each([UserRole.CLIENT, UserRole.ADMIN])(
    "a %s cannot submit lawyer credentials",
    async (role) => {
      const findByUserId = vi.fn();
      await expect(
        submitLawyerCredentialUseCase(
          { userId: "u1", role },
          { licenseNumber: "MN-1", issuingAuthority: "MBA" } as never,
          { fileName: "a.pdf", contentType: "application/pdf", body: new Uint8Array([1]) },
          { lawyerProfileRepository: { findByUserId } } as never,
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(findByUserId).not.toHaveBeenCalled();
    },
  );

  it("profile editing resolves the profile from the actor, never another id, and cannot touch verification or listing", async () => {
    const own = profile({ id: "lp-own", userId: "actor-1" });
    const findByUserId = vi.fn().mockResolvedValue(own);
    const update = vi.fn().mockResolvedValue(own);
    await updateLawyerProfileUseCase(
      { userId: "actor-1", role: UserRole.LAWYER },
      {
        headline: "Counsel",
        bio: null,
        yearsOfExperience: 3,
        city: null,
        education: null,
        timezone: "Asia/Ulaanbaatar",
        lastName: "Бат",
        firstName: "Эрдэнэ",
        phone: null,
        // Malicious extras a crafted request might carry:
        verificationStatus: "APPROVED",
        isListed: true,
        position: "ATTORNEY",
      } as never,
      {
        lawyerProfileRepository: { findByUserId, update } as never,
        userRepository: { updateProfile: vi.fn() } as never,
        auditLogRepository: { create: vi.fn() } as never,
      },
    );

    expect(findByUserId).toHaveBeenCalledWith("actor-1");
    expect(update).toHaveBeenCalledTimes(1);
    const [id, patch] = update.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe("lp-own");
    expect(patch).not.toHaveProperty("verificationStatus");
    expect(patch).not.toHaveProperty("isListed");
    expect(patch).not.toHaveProperty("position");
  });
});
