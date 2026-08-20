import { describe, expect, it, vi } from "vitest";

import { setLawyerDirectoryListingUseCase } from "@/application/use-cases/profiles/set-lawyer-directory-listing";
import { updateLawyerProfileUseCase } from "@/application/use-cases/profiles/update-lawyer-profile";
import { UserRole, LawyerVerificationStatus } from "@/domain/enums";
import { ForbiddenError, ValidationError } from "@/domain/errors/domain-error";
import type { LawyerProfile } from "@/domain/entities/profile";

function profile(overrides: Partial<LawyerProfile> = {}): LawyerProfile {
  return {
    id: "lp_1",
    userId: "u_1",
    slug: "test-lawyer",
    headline: "Counsel",
    bio: null,
    yearsOfExperience: null,
    city: null,
    education: null,
    phone: null,
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

const profileInput = {
  headline: "Counsel",
  bio: null,
  yearsOfExperience: null,
  city: null,
  education: null,
  timezone: "Asia/Ulaanbaatar",
  lastName: "Бат",
  firstName: "Эрдэнэ",
  phone: "+97611111111",
};

describe("updateLawyerProfileUseCase listing", () => {
  it("does not let a lawyer set isListed themselves", async () => {
    const existing = profile();
    const updated = profile({ phone: "+97611111111" });
    const update = vi.fn().mockResolvedValue(updated);
    const updateProfile = vi.fn().mockResolvedValue({});
    const deps = {
      lawyerProfileRepository: {
        findByUserId: vi.fn().mockResolvedValue(existing),
        hasActiveOffering: vi.fn(),
        update,
      },
      userRepository: { updateProfile },
      auditLogRepository: { create: vi.fn().mockResolvedValue({}) },
    };

    await updateLawyerProfileUseCase(
      { userId: "u_1", role: UserRole.LAWYER },
      profileInput,
      deps as never,
    );

    expect(update).toHaveBeenCalledWith(
      "lp_1",
      expect.not.objectContaining({ isListed: true }),
    );
    expect(update.mock.calls[0]?.[1].isListed).toBeUndefined();
    expect(updateProfile).toHaveBeenCalledWith("u_1", { name: "Бат Эрдэнэ" });
  });

  it("rejects listing updates from non-lawyers on the profile use-case", async () => {
    await expect(
      updateLawyerProfileUseCase(
        { userId: "admin", role: UserRole.ADMIN },
        profileInput,
        {
          lawyerProfileRepository: { findByUserId: vi.fn() },
          userRepository: { updateProfile: vi.fn() },
          auditLogRepository: { create: vi.fn() },
        } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("setLawyerDirectoryListingUseCase", () => {
  it("lets an admin list an approved lawyer", async () => {
    const existing = profile();
    const updated = profile({ isListed: true });
    const update = vi.fn().mockResolvedValue(updated);
    const result = await setLawyerDirectoryListingUseCase(
      { userId: "admin", role: UserRole.ADMIN },
      { lawyerProfileId: "lp_1", isListed: true },
      {
        lawyerProfileRepository: {
          findById: vi.fn().mockResolvedValue(existing),
          update,
        },
        auditLogRepository: { create: vi.fn().mockResolvedValue({}) },
      } as never,
    );

    expect(update).toHaveBeenCalledWith("lp_1", { isListed: true });
    expect(result.isListed).toBe(true);
  });

  it("rejects listing a pending, rejected, or suspended lawyer", async () => {
    for (const verificationStatus of [
      LawyerVerificationStatus.PENDING,
      LawyerVerificationStatus.REJECTED,
      LawyerVerificationStatus.SUSPENDED,
    ]) {
      await expect(
        setLawyerDirectoryListingUseCase(
          { userId: "admin", role: UserRole.ADMIN },
          { lawyerProfileId: "lp_1", isListed: true },
          {
            lawyerProfileRepository: {
              findById: vi.fn().mockResolvedValue(profile({ verificationStatus })),
              update: vi.fn(),
            },
            auditLogRepository: { create: vi.fn() },
          } as never,
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it("forbids a lawyer from using the admin listing use-case", async () => {
    await expect(
      setLawyerDirectoryListingUseCase(
        { userId: "u_1", role: UserRole.LAWYER },
        { lawyerProfileId: "lp_1", isListed: true },
        {
          lawyerProfileRepository: { findById: vi.fn() },
          auditLogRepository: { create: vi.fn() },
        } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
