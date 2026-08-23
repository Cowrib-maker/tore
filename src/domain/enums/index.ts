export enum UserRole {
  CLIENT = "CLIENT",
  LAWYER = "LAWYER",
  ADMIN = "ADMIN",
}

export enum UserStatus {
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
  DEACTIVATED = "DEACTIVATED",
}

export enum LawyerVerificationStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  SUSPENDED = "SUSPENDED",
}

export enum CredentialReviewStatus {
  SUBMITTED = "SUBMITTED",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export enum BookingStatus {
  DRAFT = "DRAFT",
  PENDING_PAYMENT = "PENDING_PAYMENT",
  PENDING_ACCEPTANCE = "PENDING_ACCEPTANCE",
  CONFIRMED = "CONFIRMED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  REFUNDED = "REFUNDED",
  DISPUTED = "DISPUTED",
}

export enum PaymentStatus {
  PENDING = "PENDING",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
  PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED",
}

export enum PayoutStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  PAID = "PAID",
  FAILED = "FAILED",
}

export enum RefundStatus {
  REQUESTED = "REQUESTED",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  PROCESSED = "PROCESSED",
}

export enum DisputeStatus {
  OPEN = "OPEN",
  RESOLVED_CLIENT = "RESOLVED_CLIENT",
  RESOLVED_LAWYER = "RESOLVED_LAWYER",
  CLOSED = "CLOSED",
}

export enum NotificationType {
  ACCOUNT_VERIFIED = "ACCOUNT_VERIFIED",
  LAWYER_APPROVED = "LAWYER_APPROVED",
  LAWYER_REJECTED = "LAWYER_REJECTED",
  BOOKING_CREATED = "BOOKING_CREATED",
  BOOKING_ACCEPTED = "BOOKING_ACCEPTED",
  BOOKING_DECLINED = "BOOKING_DECLINED",
  BOOKING_CANCELLED = "BOOKING_CANCELLED",
  PAYMENT_SUCCEEDED = "PAYMENT_SUCCEEDED",
  PAYMENT_FAILED = "PAYMENT_FAILED",
  MESSAGE_RECEIVED = "MESSAGE_RECEIVED",
  CONSULTATION_REMINDER = "CONSULTATION_REMINDER",
  REVIEW_REQUESTED = "REVIEW_REQUESTED",
  PAYOUT_PROCESSED = "PAYOUT_PROCESSED",
}

export enum AuditAction {
  CREATE = "CREATE",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
  LOGIN = "LOGIN",
  LOGOUT = "LOGOUT",
  APPROVE = "APPROVE",
  REJECT = "REJECT",
  SUSPEND = "SUSPEND",
  REFUND = "REFUND",
}

export enum DayOfWeek {
  MONDAY = "MONDAY",
  TUESDAY = "TUESDAY",
  WEDNESDAY = "WEDNESDAY",
  THURSDAY = "THURSDAY",
  FRIDAY = "FRIDAY",
  SATURDAY = "SATURDAY",
  SUNDAY = "SUNDAY",
}

export enum TermsType {
  TERMS_OF_SERVICE = "TERMS_OF_SERVICE",
  PRIVACY_POLICY = "PRIVACY_POLICY",
  MARKETPLACE_DISCLAIMER = "MARKETPLACE_DISCLAIMER",
}

export enum LanguageProficiency {
  BASIC = "BASIC",
  CONVERSATIONAL = "CONVERSATIONAL",
  FLUENT = "FLUENT",
  NATIVE = "NATIVE",
}

export enum ConsultationModality {
  ONLINE = "ONLINE",
  IN_PERSON = "IN_PERSON",
}

export enum TenantKind {
  INDIVIDUAL = "INDIVIDUAL",
  ORGANIZATION = "ORGANIZATION",
}

export enum TenantStatus {
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
  DEACTIVATED = "DEACTIVATED",
}

/**
 * EPIC 02 · Sprint 2.2 Wave 2 — Professional type (domain only).
 * LAWYER only — do not add future professions here in Wave 2.
 */
export enum ProfessionalType {
  LAWYER = "LAWYER",
}

/** EPIC 02 · Sprint 2.3 — Organization types (writable set only). */
export enum OrganizationType {
  LAW_FIRM = "LAW_FIRM",
  LEGAL_ENTITY = "LEGAL_ENTITY",
}

export enum OrganizationStatus {
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
  DEACTIVATED = "DEACTIVATED",
}

/** Coarse org RBAC labels; Foundation writers only use OWNER. */
export enum OrganizationRole {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  MEMBER = "MEMBER",
}

/** Membership status; Foundation writers only create ACTIVE. */
export enum OrganizationMembershipStatus {
  ACTIVE = "ACTIVE",
  INVITED = "INVITED",
  REVOKED = "REVOKED",
  SUSPENDED = "SUSPENDED",
}

/**
 * EPIC 02 · Wave 2 Step 3 — Active Context kind.
 * PERSONAL = user's personal tenant; ORGANIZATION = org tenant via membership.
 */
export enum ActiveContextType {
  PERSONAL = "PERSONAL",
  ORGANIZATION = "ORGANIZATION",
}

export enum SubscriptionPlanCode {
  SOLO = "SOLO",
  TEAM = "TEAM",
  CITIZEN_BASIC = "CITIZEN_BASIC",
  CITIZEN_PLUS = "CITIZEN_PLUS",
}

export enum LegalQuestionStatus {
  NEW = "NEW",
  CLARIFYING = "CLARIFYING",
  ANSWERED = "ANSWERED",
}

export enum SubscriptionStatus {
  PENDING = "PENDING",
  ACTIVE = "ACTIVE",
  PAST_DUE = "PAST_DUE",
  CANCELED = "CANCELED",
  EXPIRED = "EXPIRED",
}

export enum InvoiceStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  FAILED = "FAILED",
  EXPIRED = "EXPIRED",
  CANCELLED = "CANCELLED",
}

export enum PaymentTransactionStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export const BILLING_PROVIDER_QPAY = "QPAY";

export enum SeatStatus {
  ACTIVE = "ACTIVE",
  REVOKED = "REVOKED",
}

export enum DeviceSessionStatus {
  ACTIVE = "ACTIVE",
  REVOKED = "REVOKED",
}

export enum AccountSharingRiskState {
  NORMAL = "NORMAL",
  SUSPICIOUS = "SUSPICIOUS",
  HIGH_RISK = "HIGH_RISK",
}

export enum EntitlementFeature {
  CASE_ANALYSIS = "CASE_ANALYSIS",
  DOCUMENT_ANALYSIS = "DOCUMENT_ANALYSIS",
  LEGAL_AI_QUERY = "LEGAL_AI_QUERY",
}
