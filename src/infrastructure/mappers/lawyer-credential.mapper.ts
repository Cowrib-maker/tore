import type {
  LawyerCredential,
  ReviewLawyerCredentialInput,
  SubmitLawyerCredentialInput,
} from "@/domain/entities/profile";
import type { CredentialReviewStatus } from "@/domain/enums";

type LawyerCredentialRecord = {
  id: string;
  lawyerProfileId: string;
  licenseNumber: string;
  issuingAuthority: string;
  documentUrl: string;
  documentFileName: string;
  status: string;
  rejectionReason: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  submittedAt: Date;
  createdAt: Date;
};

export function mapLawyerCredential(
  record: LawyerCredentialRecord,
): LawyerCredential {
  return {
    id: record.id,
    lawyerProfileId: record.lawyerProfileId,
    licenseNumber: record.licenseNumber,
    issuingAuthority: record.issuingAuthority,
    documentUrl: record.documentUrl,
    documentFileName: record.documentFileName,
    status: record.status as CredentialReviewStatus,
    rejectionReason: record.rejectionReason,
    reviewedByUserId: record.reviewedByUserId,
    reviewedAt: record.reviewedAt,
    submittedAt: record.submittedAt,
    createdAt: record.createdAt,
  };
}

export const lawyerCredentialSelect = {
  id: true,
  lawyerProfileId: true,
  licenseNumber: true,
  issuingAuthority: true,
  documentUrl: true,
  documentFileName: true,
  status: true,
  rejectionReason: true,
  reviewedByUserId: true,
  reviewedAt: true,
  submittedAt: true,
  createdAt: true,
} as const;

export type { SubmitLawyerCredentialInput, ReviewLawyerCredentialInput };
