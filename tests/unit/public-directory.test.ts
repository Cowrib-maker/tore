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

function offering(lawyerProfileId: string, priceMnt: number, modality: "ONLINE" | "IN_PERSON") {
  return {
    id: `off-${lawyerProfileId}-${priceMnt}`,
    lawyerProfileId,
    titleMn: "Зөвлөгөө",
    titleEn: null,
    descriptionMn: null,
    durationMinutes: 60,
    priceMnt,
    modality,
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("searchListedLawyers — public card data", () => {
  it("never exposes phone or license number on the card and does not query credentials", async () => {
    const profiles = [
      { ...profile("lp1", "u1"), phone: "99112233" },
      profile("lp2", "u2"),
    ];
    const findByLawyerProfileIds = vi.fn(async () => [credential("lp1", "LIC-1")]);

    const deps = {
      lawyerProfileRepository: { findListed: vi.fn(async () => profiles) },
      lawyerCredentialRepository: { findByLawyerProfileIds },
      consultationOfferingRepository: {
        findActiveByLawyerProfileIds: vi.fn(async () => [
          offering("lp1", 120000, "IN_PERSON"),
          offering("lp1", 80000, "ONLINE"),
        ]),
      },
      lawyerTaxonomyRepository: {
        getPracticeAreasForProfiles: vi.fn(async () => []),
        getLanguagesForProfiles: vi.fn(async () => []),
      },
      practiceAreaRepository: { findAllActive: vi.fn(async () => []) },
      languageRepository: { findAllActive: vi.fn(async () => []) },
      userRepository: { findByIds: vi.fn(async () => [user("u1"), user("u2")]) },
    };

    const cards = await searchListedLawyers({}, deps as never);

    expect(findByLawyerProfileIds).not.toHaveBeenCalled();
    for (const card of cards) {
      expect(card).not.toHaveProperty("phone");
      expect(card).not.toHaveProperty("licenseNumber");
    }
    const byId = new Map(cards.map((card) => [card.profile.id, card]));
    // Real persisted data only: price from offerings, none invented for lp2.
    expect(byId.get("lp1")?.minPriceMnt).toBe(80000);
    expect([...(byId.get("lp1")?.modalities ?? [])].sort()).toEqual(["IN_PERSON", "ONLINE"]);
    expect(byId.get("lp2")?.minPriceMnt).toBeNull();
    expect(byId.get("lp2")?.modalities).toEqual([]);
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
