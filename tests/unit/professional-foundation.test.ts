import { afterEach, describe, expect, it } from "vitest";

import type { LawyerProfile } from "@/domain/entities/profile";
import { LawyerVerificationStatus, ProfessionalType } from "@/domain/enums";
import { mapLawyerProfileToProfessional } from "@/infrastructure/mappers/professional.mapper";
import {
  FOUNDATION_PROFESSIONAL_V1_FLAG,
  isFoundationProfessionalV1Enabled,
} from "@/lib/feature-flags";

function makeLawyerProfile(
  overrides: Partial<LawyerProfile> = {},
): LawyerProfile {
  return {
    id: "lp_1",
    userId: "user_1",
    slug: "demo-lawyer",
    headline: null,
    bio: null,
    yearsOfExperience: null,
    city: null,
    education: null,
    phone: null,
    verificationStatus: LawyerVerificationStatus.PENDING,
    verifiedAt: null,
    isListed: false,
    averageRating: null,
    reviewCount: 0,
    timezone: "Asia/Ulaanbaatar",
    deletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("foundation professional feature flag", () => {
  afterEach(() => {
    delete process.env[FOUNDATION_PROFESSIONAL_V1_FLAG];
  });

  it("defaults to OFF when unset", () => {
    delete process.env[FOUNDATION_PROFESSIONAL_V1_FLAG];
    expect(isFoundationProfessionalV1Enabled()).toBe(false);
  });

  it("enables only when exactly 1", () => {
    process.env[FOUNDATION_PROFESSIONAL_V1_FLAG] = "1";
    expect(isFoundationProfessionalV1Enabled()).toBe(true);
    process.env[FOUNDATION_PROFESSIONAL_V1_FLAG] = "true";
    expect(isFoundationProfessionalV1Enabled()).toBe(false);
  });
});

describe("mapLawyerProfileToProfessional", () => {
  it("maps LawyerProfile to Professional with identical id and LAWYER type", () => {
    const profile = makeLawyerProfile();
    const professional = mapLawyerProfileToProfessional(profile);

    expect(professional).toEqual({
      id: "lp_1",
      userId: "user_1",
      type: ProfessionalType.LAWYER,
    });
    expect(professional?.id).toBe(profile.id);
    expect(professional?.userId).toBe(profile.userId);
  });

  it("returns null when profile is missing (e.g. CLIENT has no Professional)", () => {
    expect(mapLawyerProfileToProfessional(null)).toBeNull();
    expect(mapLawyerProfileToProfessional(undefined)).toBeNull();
  });

  it("returns null for soft-deleted LawyerProfile", () => {
    const profile = makeLawyerProfile({
      deletedAt: new Date("2026-02-01T00:00:00.000Z"),
    });
    expect(mapLawyerProfileToProfessional(profile)).toBeNull();
  });

  it("does not invent or mutate LawyerProfile fields", () => {
    const profile = makeLawyerProfile({ slug: "keep-slug", isListed: true });
    const snapshot = structuredClone(profile);
    mapLawyerProfileToProfessional(profile);
    expect(profile).toEqual(snapshot);
  });
});
