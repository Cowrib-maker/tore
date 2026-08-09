import type {
  CreateLawyerProfileInput,
  LawyerProfile,
  UpdateLawyerProfileInput,
} from "@/domain/entities/profile";
import type { LawyerVerificationStatus } from "@/domain/enums";
import { LawyerVerificationStatus as LawyerVerificationStatusEnum } from "@/domain/enums";
import type {
  LawyerDiscoveryFilters,
  LawyerProfileRepository,
} from "@/domain/repositories/profile-repository";
import {
  lawyerProfileSelect,
  mapLawyerProfile,
} from "@/infrastructure/mappers/profile.mapper";
import { prisma } from "@/infrastructure/database/prisma";

export class PrismaLawyerProfileRepository implements LawyerProfileRepository {
  async findById(id: string): Promise<LawyerProfile | null> {
    const record = await prisma.lawyerProfile.findFirst({
      where: { id, deletedAt: null },
      select: lawyerProfileSelect,
    });
    return record ? mapLawyerProfile(record) : null;
  }

  async findByUserId(userId: string): Promise<LawyerProfile | null> {
    const record = await prisma.lawyerProfile.findFirst({
      where: { userId, deletedAt: null },
      select: lawyerProfileSelect,
    });
    return record ? mapLawyerProfile(record) : null;
  }

  async findBySlug(slug: string): Promise<LawyerProfile | null> {
    const record = await prisma.lawyerProfile.findFirst({
      where: { slug, deletedAt: null },
      select: lawyerProfileSelect,
    });
    return record ? mapLawyerProfile(record) : null;
  }

  async slugExists(slug: string): Promise<boolean> {
    const count = await prisma.lawyerProfile.count({
      where: { slug },
    });
    return count > 0;
  }

  async create(input: CreateLawyerProfileInput): Promise<LawyerProfile> {
    const record = await prisma.lawyerProfile.create({
      data: {
        userId: input.userId,
        slug: input.slug,
        headline: input.headline,
        timezone: input.timezone ?? "Asia/Ulaanbaatar",
        verificationStatus: LawyerVerificationStatusEnum.PENDING,
        isListed: false,
      },
      select: lawyerProfileSelect,
    });
    return mapLawyerProfile(record);
  }

  async update(
    id: string,
    input: UpdateLawyerProfileInput,
  ): Promise<LawyerProfile> {
    const record = await prisma.lawyerProfile.update({
      where: { id },
      data: {
        headline: input.headline,
        bio: input.bio,
        yearsOfExperience: input.yearsOfExperience,
        timezone: input.timezone,
        isListed: input.isListed,
      },
      select: lawyerProfileSelect,
    });
    return mapLawyerProfile(record);
  }

  async updateVerificationStatus(
    id: string,
    status: LawyerVerificationStatus,
    verifiedAt?: Date,
  ): Promise<LawyerProfile> {
    const record = await prisma.lawyerProfile.update({
      where: { id },
      data: {
        verificationStatus: status,
        verifiedAt:
          verifiedAt ??
          (status === LawyerVerificationStatusEnum.APPROVED
            ? new Date()
            : null),
      },
      select: lawyerProfileSelect,
    });
    return mapLawyerProfile(record);
  }

  async updateRatingAggregate(
    id: string,
    averageRating: number,
    reviewCount: number,
  ): Promise<LawyerProfile> {
    const record = await prisma.lawyerProfile.update({
      where: { id },
      data: {
        averageRating,
        reviewCount,
      },
      select: lawyerProfileSelect,
    });
    return mapLawyerProfile(record);
  }

  async findListed(filters?: LawyerDiscoveryFilters): Promise<LawyerProfile[]> {
    const records = await prisma.lawyerProfile.findMany({
      where: {
        deletedAt: null,
        isListed: true,
        verificationStatus: LawyerVerificationStatusEnum.APPROVED,
        ...(filters?.minRating != null
          ? { averageRating: { gte: filters.minRating } }
          : {}),
        ...(filters?.practiceAreaId
          ? {
              practiceAreas: {
                some: { practiceAreaId: filters.practiceAreaId },
              },
            }
          : {}),
        ...(filters?.languageId
          ? {
              languages: {
                some: { languageId: filters.languageId },
              },
            }
          : {}),
      },
      select: lawyerProfileSelect,
      orderBy: [{ averageRating: "desc" }, { createdAt: "desc" }],
      take: filters?.limit,
      skip: filters?.offset,
    });

    return records.map(mapLawyerProfile);
  }
}

export const lawyerProfileRepository = new PrismaLawyerProfileRepository();
