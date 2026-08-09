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
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";
import { mapUniqueViolation } from "@/infrastructure/database/prisma-errors";

export class PrismaLawyerProfileRepository implements LawyerProfileRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async findById(id: string): Promise<LawyerProfile | null> {
    const record = await this.db.lawyerProfile.findFirst({
      where: { id, deletedAt: null },
      select: lawyerProfileSelect,
    });
    return record ? mapLawyerProfile(record) : null;
  }

  async findByUserId(userId: string): Promise<LawyerProfile | null> {
    const record = await this.db.lawyerProfile.findFirst({
      where: { userId, deletedAt: null },
      select: lawyerProfileSelect,
    });
    return record ? mapLawyerProfile(record) : null;
  }

  async findBySlug(slug: string): Promise<LawyerProfile | null> {
    const record = await this.db.lawyerProfile.findFirst({
      where: { slug, deletedAt: null },
      select: lawyerProfileSelect,
    });
    return record ? mapLawyerProfile(record) : null;
  }

  async slugExists(slug: string): Promise<boolean> {
    const count = await this.db.lawyerProfile.count({
      where: { slug, deletedAt: null },
    });
    return count > 0;
  }

  async hasActiveOffering(lawyerProfileId: string): Promise<boolean> {
    const count = await this.db.consultationOffering.count({
      where: {
        lawyerProfileId,
        isActive: true,
        deletedAt: null,
      },
    });
    return count > 0;
  }

  async create(input: CreateLawyerProfileInput): Promise<LawyerProfile> {
    try {
      const record = await this.db.lawyerProfile.create({
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
    } catch (error) {
      mapUniqueViolation(error, "Lawyer profile slug or user already exists");
    }
  }

  async update(
    id: string,
    input: UpdateLawyerProfileInput,
  ): Promise<LawyerProfile> {
    const record = await this.db.lawyerProfile.update({
      where: { id },
      data: {
        headline: input.headline,
        bio: input.bio,
        yearsOfExperience: input.yearsOfExperience,
        city: input.city,
        education: input.education,
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
    const record = await this.db.lawyerProfile.update({
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
    const record = await this.db.lawyerProfile.update({
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
    const records = await this.db.lawyerProfile.findMany({
      where: {
        deletedAt: null,
        isListed: true,
        verificationStatus: LawyerVerificationStatusEnum.APPROVED,
        offerings: {
          some: {
            isActive: true,
            deletedAt: null,
          },
        },
        ...(filters?.minRating != null
          ? { averageRating: { gte: filters.minRating } }
          : {}),
        ...(filters?.city
          ? {
              city: {
                contains: filters.city,
                mode: "insensitive" as const,
              },
            }
          : {}),
        ...(filters?.query
          ? {
              OR: [
                { headline: { contains: filters.query, mode: "insensitive" as const } },
                { bio: { contains: filters.query, mode: "insensitive" as const } },
                { slug: { contains: filters.query, mode: "insensitive" as const } },
                {
                  user: {
                    name: {
                      contains: filters.query,
                      mode: "insensitive" as const,
                    },
                  },
                },
              ],
            }
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
