import { describe, expect, it, vi } from "vitest";

import { searchListedLawyers } from "@/application/use-cases/discovery/public-directory";
import { CredentialReviewStatus } from "@/domain/enums";

function profile(id: string, userId: string) {
  return {
    id,
    userId,
    slug: `slug-${id}`,
    headline: "Corporate",
    bio: null,
    yearsOfExperience: 5,
    city: "Ulaanbaatar",
    education: null,
    phone: null,
    timezone: "Asia/Ulaanbaatar",
    position: "ATTORNEY" as const,
    verificationStatus: "APPROVED" as const,
    verifiedAt: new Date(),
    isListed: true,
    averageRating: null,
    reviewCount: 0,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function user(id: string) {
  return { id, name: `Lawyer ${id}`, image: null } as never;
}

function credential(lawyerProfileId: string, licenseNumber: string) {
  return {
    id: `cred-${lawyerProfileId}`,
    lawyerProfileId,
    licenseNumber,
    issuingAuthority: "MOJ",
    documentUrl: "lawyer-credential/lp/doc.pdf",
    documentFileName: "doc.pdf",
    status: CredentialReviewStatus.APPROVED,
    rejectionReason: null,
    reviewedByUserId: null,
    reviewedAt: new Date(),
    submittedAt: new Date(),
  };
}

describe("searchListedLawyers — batched credential lookup (N+1 regression)", () => {
  it("fetches credentials for all profiles in a single batched call, not one per profile", async () => {
    const profiles = [profile("lp1", "u1"), profile("lp2", "u2"), profile("lp3", "u3")];
    const findByLawyerProfileIds = vi.fn(async () => [
      credential("lp1", "LIC-1"),
      credential("lp3", "LIC-3"),
    ]);
    const findByLawyerProfileId = vi.fn();

    const deps = {
      lawyerProfileRepository: {
        findListed: vi.fn(async () => profiles),
      },
      lawyerCredentialRepository: {
        findByLawyerProfileId,
        findByLawyerProfileIds,
      },
      consultationOfferingRepository: {
        findActiveByLawyerProfileIds: vi.fn(async () => []),
      },
      lawyerTaxonomyRepository: {
        getPracticeAreasForProfiles: vi.fn(async () => []),
        getLanguagesForProfiles: vi.fn(async () => []),
      },
      practiceAreaRepository: { findAllActive: vi.fn(async () => []) },
      languageRepository: { findAllActive: vi.fn(async () => []) },
      userRepository: {
        findByIds: vi.fn(async () => [user("u1"), user("u2"), user("u3")]),
      },
    };

    const cards = await searchListedLawyers({}, deps as never);

    expect(findByLawyerProfileIds).toHaveBeenCalledTimes(1);
    expect(findByLawyerProfileIds).toHaveBeenCalledWith(["lp1", "lp2", "lp3"]);
    expect(findByLawyerProfileId).not.toHaveBeenCalled();

    const byId = new Map(cards.map((card) => [card.profile.id, card]));
    expect(byId.get("lp1")?.licenseNumber).toBe("LIC-1");
    expect(byId.get("lp2")?.licenseNumber).toBeNull();
    expect(byId.get("lp3")?.licenseNumber).toBe("LIC-3");
  });

  it("returns an empty list without querying dependents when no lawyers are listed", async () => {
    const findByLawyerProfileIds = vi.fn();
    const deps = {
      lawyerProfileRepository: { findListed: vi.fn(async () => []) },
      lawyerCredentialRepository: { findByLawyerProfileIds },
      consultationOfferingRepository: { findActiveByLawyerProfileIds: vi.fn() },
      lawyerTaxonomyRepository: {
        getPracticeAreasForProfiles: vi.fn(),
        getLanguagesForProfiles: vi.fn(),
      },
      practiceAreaRepository: { findAllActive: vi.fn() },
      languageRepository: { findAllActive: vi.fn() },
      userRepository: { findByIds: vi.fn() },
    };

    const cards = await searchListedLawyers({}, deps as never);

    expect(cards).toEqual([]);
    expect(findByLawyerProfileIds).not.toHaveBeenCalled();
  });
});
