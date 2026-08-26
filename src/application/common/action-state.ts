/** Shared result shape for Next.js server actions bound to forms. */
export type ActionState = {
  error?: string;
  success?: boolean;
  message?: string;
  /** Stable machine code for UI branching. Never show this to users. */
  code?: string;
  email?: string;
};

export const AUTH_ACTION_CODE = {
  EMAIL_NOT_VERIFIED: "EMAIL_NOT_VERIFIED",
  RESEND_SENT: "RESEND_SENT",
  RATE_LIMITED: "RATE_LIMITED",
  EMAIL_ALREADY_VERIFIED: "EMAIL_ALREADY_VERIFIED",
  EMAIL_NOT_FOUND: "EMAIL_NOT_FOUND",
  EMAIL_CONFIGURATION: "EMAIL_CONFIGURATION",
  EMAIL_DELIVERY_FAILED: "EMAIL_DELIVERY_FAILED",
  EMAIL_VERIFICATION_INVALID: "EMAIL_VERIFICATION_INVALID",
  EMAIL_VERIFICATION_EXPIRED: "EMAIL_VERIFICATION_EXPIRED",
  EMAIL_VERIFIED: "EMAIL_VERIFIED",
  INVALID_EMAIL: "INVALID_EMAIL",
  TEMPORARY_FAILURE: "TEMPORARY_FAILURE",
} as const;
