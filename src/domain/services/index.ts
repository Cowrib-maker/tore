export {
  DASHBOARD_PATH,
  ROLE_ROUTE_PREFIX,
  LEGAL_AI_PATH,
  getDashboardPath,
  getPostAuthRedirect,
  safeLegalAiCallback,
  legalAiHref,
  loginHrefForLegalAi,
  registerClientHrefForLegalAi,
  canAccessRoute,
  isAccountUsable,
  assertRole,
} from "./rbac";
export {
  canTransitionBooking,
  assertBookingTransition,
  getAllowedBookingTransitions,
  TERMINAL_BOOKING_STATUSES,
  isTerminalBookingStatus,
  isActiveBookingStatus,
} from "./booking-state-machine";
export {
  DEFAULT_PLATFORM_FEE_PERCENT,
  calculatePlatformFee,
  calculateFeeBreakdown,
  parsePlatformFeePercent,
} from "./fee-calculator";
export type { FeeBreakdown } from "./fee-calculator";
export {
  isBlockingBookingStatus,
  hasConflictingBooking,
  isWithinWeeklyRules,
  isBlockedByException,
  isSlotAvailable,
} from "./slot-availability";
export {
  DEFAULT_CANCELLATION_POLICY,
  evaluateCancellationRefund,
  calculateRefundAmount,
} from "./cancellation-policy";
export type {
  CancellationActor,
  CancellationPolicyConfig,
  CancellationRefundDecision,
} from "./cancellation-policy";
export {
  MIN_REVIEW_RATING,
  MAX_REVIEW_RATING,
  assertValidRating,
  computeNextRatingAggregate,
} from "./rating-aggregator";
export type { RatingAggregate } from "./rating-aggregator";
export {
  slugifyDisplayName,
  buildLawyerSlugCandidate,
  generateSlugSuffix,
  generateLawyerSlug,
} from "./slug-generator";
export { createLawyerProfileWithUniqueSlug } from "./allocate-lawyer-slug";
export {
  formatBookingNumber,
  DEFAULT_BOOKING_NUMBER_PREFIX,
} from "./booking-number";
export {
  generateCandidateSlots,
  filterAvailableSlots,
} from "./generate-slots";
export {
  evaluateAccountSharingRisk,
  shouldRestrictExpensiveOps,
  RISK_SIGNAL_FAMILIES,
} from "./account-sharing-risk";
export type {
  AccountSharingRiskInput,
  AccountSharingRiskResult,
  RiskSignalFamily,
  RiskSignalId,
} from "./account-sharing-risk";
export {
  resolveLawyerEntitlement,
  evaluateFeatureQuota,
  isSubscriptionActive,
  toPublicUsageSnapshot,
  utcMonthStart,
  utcMonthEnd,
  emptyUsageCounts,
} from "./entitlement";
export type {
  LawyerEntitlement,
  PublicUsageSnapshot,
  QuotaDecision,
} from "./entitlement";
export {
  isLawyerVerified,
  isLawyerPubliclyListed,
  canClientBookLawyer,
  canLawyerManageOfferings,
  canSubmitCredentials,
  isCredentialPendingReview,
  isUserActive,
  canRegisterAs,
} from "./lawyer-eligibility";
export { summarizeUserAgent, truncateUserAgent } from "./user-agent";
