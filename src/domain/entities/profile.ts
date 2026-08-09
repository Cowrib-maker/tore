import type {
  CredentialReviewStatus,
  LawyerVerificationStatus,
} from "@/domain/enums";

export interface ClientProfile {
  id: string;
  userId: string;
  phone: string | null;
  companyName: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateClientProfileInput {
  userId: string;
  phone?: string;
  companyName?: string;
}

export interface UpdateClientProfileInput {
  phone?: string | null;
  companyName?: string | null;
}

export interface LawyerProfile {
  id: string;
  userId: string;
  slug: string;
  headline: string | null;
  bio: string | null;
  yearsOfExperience: number | null;
  city: string | null;
  education: string | null;
  verificationStatus: LawyerVerificationStatus;
  verifiedAt: Date | null;
  isListed: boolean;
  averageRating: number | null;
  reviewCount: number;
  timezone: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLawyerProfileInput {
  userId: string;
  slug: string;
  headline?: string;
  timezone?: string;
}

export interface UpdateLawyerProfileInput {
  headline?: string | null;
  bio?: string | null;
  yearsOfExperience?: number | null;
  city?: string | null;
  education?: string | null;
  timezone?: string;
  isListed?: boolean;
}

export interface LawyerCredential {
  id: string;
  lawyerProfileId: string;
  licenseNumber: string;
  issuingAuthority: string;
  documentUrl: string;
  documentFileName: string;
  status: CredentialReviewStatus;
  rejectionReason: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  submittedAt: Date;
  createdAt: Date;
}

export interface SubmitLawyerCredentialInput {
  lawyerProfileId: string;
  licenseNumber: string;
  issuingAuthority: string;
  documentUrl: string;
  documentFileName: string;
}

export interface ReviewLawyerCredentialInput {
  status: CredentialReviewStatus;
  rejectionReason?: string;
  reviewedByUserId: string;
}
