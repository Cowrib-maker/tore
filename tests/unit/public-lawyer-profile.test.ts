import { describe, expect, it, vi } from "vitest";

import { getPublicLawyerProfile } from "@/application/use-cases/discovery/public-directory";
import { PrismaLawyerProfileRepository } from "@/infrastructure/repositories/prisma-lawyer-profile-repository";

type ProfileOverrides = Partial<{
  isListed: boolean;
  verificationStatus: string;
  position: string;
}>;

function profile(overrides: ProfileOverrides = {}) {
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
    timezone: "Asia/Ulaanbaatar",
    position: "ATTORNEY",
    verificationStatus: "APPROVED",
    verifiedAt: new Date(),
    isListed: true,
    averageRating: null,
    reviewCount: 0,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const offering = {
  id: "o1",
  lawyerProfileId: "lp1",
  titleMn: "Онлайн зөвлөгөө",
  titleEn: null,
  descriptionMn: null,
  durationMinutes: 60,
  priceMnt: 100000,
  modality: "ONLINE",
  isActive: true,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function deps(p: ReturnType<typeof profile> | null, hasActiveOffering = true) {
  return {
    lawyerProfileRepository: {
      findBySlug: vi.fn(async () => p),
      hasActiveOffering: vi.fn(async () => hasActiveOffering),
    },
    lawyerCredentialRepository: { findByLawyerProfileId: vi.fn(async () => []) },
    consultationOfferingRepository: {
      findActiveByLawyerProfileId: vi.fn(async () => [offering]),
    },
    availabilityRepository: {
      findActiveRulesByLawyerProfileId: vi.fn(async () => []),
      findExceptionsByLawyerProfileId: vi.fn(async () => []),
    },
    bookingRepository: { findBusyForLawyerInRange: vi.fn(async () => []) },
    practiceAreaRepository: { findAllActive: vi.fn(async () => []) },
    languageRepository: { findAllActive: vi.fn(async () => []) },
    lawyerTaxonomyRepository: {
      getPracticeAreas: vi.fn(async () => []),
      getLanguages: vi.fn(async () => []),
    },
    userRepository: {
      findById: vi.fn(async () => ({ id: "u1", name: "Бат", image: null })),
    },
  } as never;
}

describe("getPublicLawyerProfile — public eligibility", () => {
  it.each([
    ["PENDING", { verificationStatus: "PENDING" }],
    ["SUSPENDED", { verificationStatus: "SUSPENDED" }],
    ["REJECTED", { verificationStatus: "REJECTED" }],
    ["not listed", { isListed: false }],
    ["not an ATTORNEY", { position: "JUDGE" }],
  ])("returns not-found for a %s lawyer", async (_label, overrides) => {
    await expect(
      getPublicLawyerProfile("bat", deps(profile(overrides))),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns not-found when there is no active offering", async () => {
    await expect(
      getPublicLawyerProfile("bat", deps(profile(), false)),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns not-found for an unknown slug", async () => {
    await expect(getPublicLawyerProfile("nobody", deps(null))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("loads an approved listed attorney with persisted offerings and leaves unset fields empty", async () => {
    const view = await getPublicLawyerProfile("bat", deps(profile()));
    expect(view.displayName).toBe("Бат");
    expect(view.offerings).toHaveLength(1);
    expect(view.offerings[0]?.priceMnt).toBe(100000);
    expect(view.profile.bio).toBeNull();
    expect(view.profile.headline).toBeNull();
    expect(view.profile.yearsOfExperience).toBeNull();
    expect(view.profile.reviewCount).toBe(0);
    expect(view.practiceAreas).toEqual([]);
    // Private contact / license identifiers are never part of the public view.
    expect(view).not.toHaveProperty("phone");
    expect(view).not.toHaveProperty("licenseNumber");
    expect(view.profile.phone).toBeNull();
  });
});

describe("PrismaLawyerProfileRepository.findListed — directory filter", () => {
  it("restricts the public directory to approved, listed, non-deleted attorneys with an active offering", async () => {
    const findMany = vi.fn(async () => []);
    const repo = new PrismaLawyerProfileRepository({
      lawyerProfile: { findMany },
    } as never);

    await repo.findListed({});

    const call = findMany.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ];
    expect(call[0].where).toMatchObject({
      deletedAt: null,
      isListed: true,
      verificationStatus: "APPROVED",
      position: "ATTORNEY",
      offerings: { some: { isActive: true, deletedAt: null } },
    });
  });

  it("orders rated lawyers before unrated ones (NULLS LAST), then newest", async () => {
    const findMany = vi.fn(async () => []);
    const repo = new PrismaLawyerProfileRepository({
      lawyerProfile: { findMany },
    } as never);

    await repo.findListed({});

    const call = findMany.mock.calls[0] as unknown as [{ orderBy: unknown }];
    expect(call[0].orderBy).toEqual([
      { averageRating: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ]);
  });
});
