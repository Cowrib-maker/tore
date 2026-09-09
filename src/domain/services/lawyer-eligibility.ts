import type { LawyerProfile } from "@/domain/entities/profile";
import {
  CredentialReviewStatus,
  LawyerPosition,
  LawyerVerificationStatus,
  UserRole,
  UserStatus,
} from "@/domain/enums";

export function isLawyerVerified(profile: LawyerProfile): boolean {
  return profile.verificationStatus === LawyerVerificationStatus.APPROVED;
}

/** Only the ATTORNEY position may ever take marketplace bookings. */
export function isMarketplaceEligiblePosition(profile: LawyerProfile): boolean {
  return profile.position === LawyerPosition.ATTORNEY;
}

export function isLawyerPubliclyListed(
  profile: LawyerProfile,
  hasActiveOffering: boolean,
): boolean {
  return (
    profile.deletedAt === null &&
    profile.isListed &&
    isLawyerVerified(profile) &&
    hasActiveOffering &&
    isMarketplaceEligiblePosition(profile) &&
    profile.verificationStatus !== LawyerVerificationStatus.SUSPENDED
  );
}

export function canClientBookLawyer(
  profile: LawyerProfile,
  hasActiveOffering: boolean,
): boolean {
  return isLawyerPubliclyListed(profile, hasActiveOffering);
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
