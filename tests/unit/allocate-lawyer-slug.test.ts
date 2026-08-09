import { describe, expect, it, vi } from "vitest";

import { ConflictError } from "@/domain/errors/domain-error";
import type { LawyerProfileRepository } from "@/domain/repositories/profile-repository";
import { createLawyerProfileWithUniqueSlug } from "@/domain/services/allocate-lawyer-slug";
import type { LawyerProfile } from "@/domain/entities/profile";
import { LawyerVerificationStatus } from "@/domain/enums";

function makeProfile(slug: string): LawyerProfile {
  const now = new Date();
  return {
    id: "profile-1",
    userId: "user-1",
    slug,
    headline: null,
    bio: null,
    yearsOfExperience: null,
    city: null,
    education: null,
    verificationStatus: LawyerVerificationStatus.PENDING,
    verifiedAt: null,
    isListed: false,
    averageRating: null,
    reviewCount: 0,
    timezone: "Asia/Ulaanbaatar",
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("createLawyerProfileWithUniqueSlug", () => {
  it("retries when create hits a slug conflict", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new ConflictError("slug taken"))
      .mockResolvedValueOnce(makeProfile("ok-slug"));

    const repo = {
      create,
    } as unknown as LawyerProfileRepository;

    const profile = await createLawyerProfileWithUniqueSlug(
      "Ada Lovelace",
      "user-1",
      repo,
    );

    expect(profile.slug).toBe("ok-slug");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("gives up after repeated conflicts", async () => {
    const create = vi
      .fn()
      .mockRejectedValue(new ConflictError("slug taken"));

    const repo = {
      create,
    } as unknown as LawyerProfileRepository;

    await expect(
      createLawyerProfileWithUniqueSlug("Ada Lovelace", "user-1", repo),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(create).toHaveBeenCalledTimes(8);
  });
});
