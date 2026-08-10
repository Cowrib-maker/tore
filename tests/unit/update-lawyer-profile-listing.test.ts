import { describe, expect, it, vi } from "vitest";

import { updateLawyerProfileUseCase } from "@/application/use-cases/profiles/update-lawyer-profile";
import { UserRole, LawyerVerificationStatus } from "@/domain/enums";
import { ValidationError } from "@/domain/errors/domain-error";
import type { LawyerProfile } from "@/domain/entities/profile";

function profile(
  overrides: Partial<LawyerProfile> = {},
): LawyerProfile {
  return {
    id: "lp_1",
    userId: "u_1",
    slug: "test-lawyer",
    headline: "Counsel",
    bio: null,
    yearsOfExperience: null,
    city: null,
    education: null,
    verificationStatus: LawyerVerificationStatus.APPROVED,
    verifiedAt: new Date(),
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

describe("updateLawyerProfileUseCase listing", () => {
  it("persists isListed=true when verified with an active offering", async () => {
    const existing = profile();
    const updated = profile({ isListed: true });
    const update = vi.fn().mockResolvedValue(updated);
    const deps = {
      lawyerProfileRepository: {
        findByUserId: vi.fn().mockResolvedValue(existing),
        hasActiveOffering: vi.fn().mockResolvedValue(true),
        update,
      },
      auditLogRepository: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const result = await updateLawyerProfileUseCase(
      { userId: "u_1", role: UserRole.LAWYER },
      {
        headline: "Counsel",
        bio: null,
        yearsOfExperience: null,
        city: null,
        education: null,
        timezone: "Asia/Ulaanbaatar",
        isListed: true,
      },
      deps as never,
    );

    expect(update).toHaveBeenCalledWith(
      "lp_1",
      expect.objectContaining({ isListed: true }),
    );
    expect(result.isListed).toBe(true);
  });

  it("rejects isListed=true when verification is pending", async () => {
    const deps = {
      lawyerProfileRepository: {
        findByUserId: vi.fn().mockResolvedValue(
          profile({ verificationStatus: LawyerVerificationStatus.PENDING }),
        ),
        hasActiveOffering: vi.fn().mockResolvedValue(true),
        update: vi.fn(),
      },
      auditLogRepository: { create: vi.fn() },
    };

    await expect(
      updateLawyerProfileUseCase(
        { userId: "u_1", role: UserRole.LAWYER },
        {
          headline: "Counsel",
          bio: null,
          yearsOfExperience: null,
          city: null,
          education: null,
          timezone: "Asia/Ulaanbaatar",
          isListed: true,
        },
        deps as never,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(deps.lawyerProfileRepository.update).not.toHaveBeenCalled();
  });

  it("rejects isListed=true without an active offering", async () => {
    const deps = {
      lawyerProfileRepository: {
        findByUserId: vi.fn().mockResolvedValue(profile()),
        hasActiveOffering: vi.fn().mockResolvedValue(false),
        update: vi.fn(),
      },
      auditLogRepository: { create: vi.fn() },
    };

    await expect(
      updateLawyerProfileUseCase(
        { userId: "u_1", role: UserRole.LAWYER },
        {
          headline: "Counsel",
          bio: null,
          yearsOfExperience: null,
          city: null,
          education: null,
          timezone: "Asia/Ulaanbaatar",
          isListed: true,
        },
        deps as never,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(deps.lawyerProfileRepository.update).not.toHaveBeenCalled();
  });
});
