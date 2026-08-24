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
} as const;
