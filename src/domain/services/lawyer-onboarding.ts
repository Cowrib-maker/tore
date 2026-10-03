import type { LawyerCredential, LawyerProfile } from "@/domain/entities/profile";
import {
  CredentialReviewStatus,
  LawyerVerificationStatus,
} from "@/domain/enums";
import {
  isLawyerPubliclyListed,
  isLawyerVerified,
} from "@/domain/services/lawyer-eligibility";

/**
 * Where a lawyer stands in Register → verification → public listing.
 * Derived only from existing persisted state; introduces no new status.
 */
export type LawyerVerificationState =
  | "SUBMIT_LICENSE"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SUSPENDED";

export type OnboardingItemKey =
  | "license"
  | "approved"
  | "offering"
  | "optedIn"
  | "headline"
  | "bio"
  | "years"
  | "city"
  | "education"
  | "photo"
  | "practiceAreas"
  | "languages"
  | "schedule";

export type OnboardingItem = { key: OnboardingItemKey; done: boolean };

export type LawyerOnboardingInput = {
  profile: LawyerProfile;
  credentials: Pick<LawyerCredential, "status">[];
  hasPhoto: boolean;
  practiceAreaCount: number;
  languageCount: number;
  activeAvailabilityRuleCount: number;
  hasActiveOffering: boolean;
};

export type LawyerOnboarding = {
  verificationState: LawyerVerificationState;
  /** The one thing the platform needs before an admin can review. */
  forVerification: OnboardingItem[];
  /** Existing public-listing gate: approved + active offering + opt-in. */
  forPublicListing: OnboardingItem[];
  /** Optional profile content; never blocks verification or listing. */
  recommended: OnboardingItem[];
  isPubliclyVisible: boolean;
};

/**
 * What the lawyer's own UI may present as "listed". The stored opt-in flag
 * can outlive an approval (e.g. a suspension), but only a verified lawyer can
 * be shown to the public, so anything else must never read as listed.
 * Presentation only: the flag itself is left untouched.
 */
export function isListedForDisplay(
  profile: Pick<LawyerProfile, "isListed" | "verificationStatus">,
): boolean {
  return (
    profile.isListed &&
    profile.verificationStatus === LawyerVerificationStatus.APPROVED
  );
}

const filled = (value: string | null | undefined) =>
  Boolean(value && value.trim().length > 0);

export function lawyerVerificationState(
  profile: Pick<LawyerProfile, "verificationStatus">,
  credentials: Pick<LawyerCredential, "status">[],
): LawyerVerificationState {
  switch (profile.verificationStatus) {
    case LawyerVerificationStatus.APPROVED:
      return "APPROVED";
    case LawyerVerificationStatus.REJECTED:
      return "REJECTED";
    case LawyerVerificationStatus.SUSPENDED:
      return "SUSPENDED";
    default:
      return credentials.some((c) => c.status === CredentialReviewStatus.SUBMITTED)
        ? "UNDER_REVIEW"
        : "SUBMIT_LICENSE";
  }
}

export function computeLawyerOnboarding(
  input: LawyerOnboardingInput,
): LawyerOnboarding {
  const { profile, credentials } = input;
  const licenseSubmitted = credentials.length > 0;

  return {
    verificationState: lawyerVerificationState(profile, credentials),
    forVerification: [{ key: "license", done: licenseSubmitted }],
    forPublicListing: [
      { key: "approved", done: isLawyerVerified(profile) },
      { key: "offering", done: input.hasActiveOffering },
      { key: "optedIn", done: isListedForDisplay(profile) },
    ],
    recommended: [
      { key: "headline", done: filled(profile.headline) },
      { key: "bio", done: filled(profile.bio) },
      { key: "years", done: profile.yearsOfExperience !== null },
      { key: "city", done: filled(profile.city) },
      { key: "education", done: filled(profile.education) },
      { key: "photo", done: input.hasPhoto },
      { key: "practiceAreas", done: input.practiceAreaCount > 0 },
      { key: "languages", done: input.languageCount > 0 },
      { key: "schedule", done: input.activeAvailabilityRuleCount > 0 },
    ],
    isPubliclyVisible: isLawyerPubliclyListed(profile, input.hasActiveOffering),
  };
}
