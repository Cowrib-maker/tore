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

  async findByIds(ids: string[]): Promise<LawyerProfile[]> {
    if (ids.length === 0) return [];
    const uniqueIds = [...new Set(ids)];
    const records = await this.db.lawyerProfile.findMany({
      where: { id: { in: uniqueIds }, deletedAt: null },
      select: lawyerProfileSelect,
    });
    return records.map(mapLawyerProfile);
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
    // Only patch provided fields so partial callers (e.g. unlist on reject)
    // cannot null out headline/bio/timezone via undefined.
    const data: {
      headline?: string | null;
      bio?: string | null;
      yearsOfExperience?: number | null;
      city?: string | null;
      education?: string | null;
      timezone?: string;
      isListed?: boolean;
    } = {};
    if (input.headline !== undefined) data.headline = input.headline;
    if (input.bio !== undefined) data.bio = input.bio;
    if (input.yearsOfExperience !== undefined) {
      data.yearsOfExperience = input.yearsOfExperience;
    }
    if (input.city !== undefined) data.city = input.city;
    if (input.education !== undefined) data.education = input.education;
    if (input.timezone !== undefined) data.timezone = input.timezone;
    if (input.isListed !== undefined) data.isListed = input.isListed;

    const record = await this.db.lawyerProfile.update({
      where: { id },
      data,
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
