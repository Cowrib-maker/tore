import type {
  ClientProfile,
  LawyerProfile,
} from "@/domain/entities/profile";
import type { LawyerVerificationStatus } from "@/domain/enums";

type ClientProfileRecord = {
  id: string;
  userId: string;
  phone: string | null;
  companyName: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type LawyerProfileRecord = {
  id: string;
  userId: string;
  slug: string;
  headline: string | null;
  bio: string | null;
  yearsOfExperience: number | null;
  city: string | null;
  education: string | null;
  verificationStatus: string;
  verifiedAt: Date | null;
  isListed: boolean;
  averageRating: { toNumber(): number } | number | null;
  reviewCount: number;
  timezone: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function mapClientProfile(record: ClientProfileRecord): ClientProfile {
  return {
    id: record.id,
    userId: record.userId,
    phone: record.phone,
    companyName: record.companyName,
    deletedAt: record.deletedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function mapLawyerProfile(record: LawyerProfileRecord): LawyerProfile {
  const averageRating =
    record.averageRating == null
      ? null
      : typeof record.averageRating === "number"
        ? record.averageRating
        : record.averageRating.toNumber();

  return {
    id: record.id,
    userId: record.userId,
    slug: record.slug,
    headline: record.headline,
    bio: record.bio,
    yearsOfExperience: record.yearsOfExperience,
    city: record.city,
    education: record.education,
    verificationStatus: record.verificationStatus as LawyerVerificationStatus,
    verifiedAt: record.verifiedAt,
    isListed: record.isListed,
    averageRating,
    reviewCount: record.reviewCount,
    timezone: record.timezone,
    deletedAt: record.deletedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export const clientProfileSelect = {
  id: true,
  userId: true,
  phone: true,
  companyName: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const lawyerProfileSelect = {
  id: true,
  userId: true,
  slug: true,
  headline: true,
  bio: true,
  yearsOfExperience: true,
  city: true,
  education: true,
  verificationStatus: true,
  verifiedAt: true,
  isListed: true,
  averageRating: true,
  reviewCount: true,
  timezone: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;
