import type { LawyerProfile } from "@/domain/entities/profile";
import {
  CredentialReviewStatus,
  LawyerVerificationStatus,
  UserRole,
  UserStatus,
} from "@/domain/enums";

export function isLawyerVerified(profile: LawyerProfile): boolean {
  return profile.verificationStatus === LawyerVerificationStatus.APPROVED;
}

export function isLawyerPubliclyListed(profile: LawyerProfile): boolean {
  return (
    profile.deletedAt === null &&
    profile.isListed &&
    isLawyerVerified(profile) &&
    profile.verificationStatus !== LawyerVerificationStatus.SUSPENDED
  );
}

export function canClientBookLawyer(profile: LawyerProfile): boolean {
  return isLawyerPubliclyListed(profile);
}

export function canLawyerManageOfferings(profile: LawyerProfile): boolean {
  return (
    profile.deletedAt === null &&
    profile.verificationStatus !== LawyerVerificationStatus.SUSPENDED
  );
}

export function canSubmitCredentials(profile: LawyerProfile): boolean {
  return (
    profile.deletedAt === null &&
    (profile.verificationStatus === LawyerVerificationStatus.PENDING ||
      profile.verificationStatus === LawyerVerificationStatus.REJECTED)
  );
}

export function isCredentialPendingReview(
  status: CredentialReviewStatus,
): boolean {
  return status === CredentialReviewStatus.SUBMITTED;
}

export function isUserActive(status: UserStatus): boolean {
  return status === UserStatus.ACTIVE;
}

export function canRegisterAs(role: UserRole): boolean {
  return role === UserRole.CLIENT || role === UserRole.LAWYER;
}
