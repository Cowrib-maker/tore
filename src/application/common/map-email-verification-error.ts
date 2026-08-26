import {
  AUTH_ACTION_CODE,
  type ActionState,
} from "@/application/common/action-state";
import {
  DomainError,
  EmailConfigurationError,
  EmailDeliveryError,
  EmailVerificationLinkError,
} from "@/domain/errors/domain-error";
import type { Dictionary } from "@/i18n/types";

type VerificationCopy = Pick<
  Dictionary["auth"],
  | "resendSentSuccess"
  | "verifyAlreadyVerified"
  | "verifyEmailNotFound"
  | "verifyEmailInvalid"
  | "verifyDeliveryFailed"
  | "verifyEmailMisconfigured"
  | "verifyTemporaryFailure"
  | "verifyRateLimited"
  | "verifyExpiredOrInvalid"
  | "verifyOtpInvalid"
  | "verifyOtpExpired"
  | "verifySuccess"
>;

const CONFIG_FAILURE_RE =
  /requires RESEND_API_KEY|requires SMTP_HOST|Production email requires|EMAIL_PROVIDER/i;

/**
 * Turn email-provider/infrastructure failures into domain errors.
 * Never copies SMTP credentials, API keys, or provider payloads onto the error.
 */
export function classifyEmailSendFailure(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  const message = error instanceof Error ? error.message : "";
  if (CONFIG_FAILURE_RE.test(message)) {
    return new EmailConfigurationError();
  }
  return new EmailDeliveryError();
}

/**
 * Maps verification/resend failures to stable action codes.
 * Does not put internal messages, tokens, or stack traces on ActionState.
 */
export function mapEmailVerificationActionError(error: unknown): ActionState {
  const code = error instanceof DomainError ? error.code : undefined;

  switch (code) {
    case "EMAIL_ALREADY_VERIFIED":
      return { code: AUTH_ACTION_CODE.EMAIL_ALREADY_VERIFIED };
    case "EMAIL_NOT_FOUND":
    case "NOT_FOUND":
      return { code: AUTH_ACTION_CODE.EMAIL_NOT_FOUND };
    case "EMAIL_CONFIGURATION":
      return { code: AUTH_ACTION_CODE.EMAIL_CONFIGURATION };
    case "EMAIL_DELIVERY_FAILED":
      return { code: AUTH_ACTION_CODE.EMAIL_DELIVERY_FAILED };
    case "VALIDATION_ERROR":
      return { code: AUTH_ACTION_CODE.INVALID_EMAIL };
    case "EMAIL_VERIFICATION_INVALID":
      if (
        error instanceof EmailVerificationLinkError &&
        error.reason === "expired"
      ) {
        return { code: AUTH_ACTION_CODE.EMAIL_VERIFICATION_EXPIRED };
      }
      return { code: AUTH_ACTION_CODE.EMAIL_VERIFICATION_INVALID };
    default:
      console.error("[email:verification] unexpected failure", error);
      return { code: AUTH_ACTION_CODE.TEMPORARY_FAILURE };
  }
}

export type ResendFeedback = {
  tone: "error" | "success" | "info";
  text: string;
};

/** UI-only: codes → locale copy. Never render ActionState.error for this form. */
export function userFacingResendFeedback(
  state: ActionState,
  copy: VerificationCopy,
): ResendFeedback | null {
  if (state.success && state.code === AUTH_ACTION_CODE.RESEND_SENT) {
    return { tone: "success", text: copy.resendSentSuccess };
  }

  if (state.success && state.code === AUTH_ACTION_CODE.EMAIL_VERIFIED) {
    return { tone: "success", text: copy.verifySuccess };
  }

  switch (state.code) {
    case AUTH_ACTION_CODE.EMAIL_ALREADY_VERIFIED:
      return { tone: "info", text: copy.verifyAlreadyVerified };
    case AUTH_ACTION_CODE.EMAIL_NOT_FOUND:
      return { tone: "error", text: copy.verifyEmailNotFound };
    case AUTH_ACTION_CODE.INVALID_EMAIL:
      return { tone: "error", text: copy.verifyEmailInvalid };
    case AUTH_ACTION_CODE.EMAIL_CONFIGURATION:
      return { tone: "error", text: copy.verifyEmailMisconfigured };
    case AUTH_ACTION_CODE.EMAIL_DELIVERY_FAILED:
      return { tone: "error", text: copy.verifyDeliveryFailed };
    case AUTH_ACTION_CODE.RATE_LIMITED:
      return { tone: "error", text: copy.verifyRateLimited };
    case AUTH_ACTION_CODE.EMAIL_VERIFICATION_INVALID:
      return { tone: "error", text: copy.verifyOtpInvalid };
    case AUTH_ACTION_CODE.EMAIL_VERIFICATION_EXPIRED:
      return { tone: "error", text: copy.verifyOtpExpired };
    case AUTH_ACTION_CODE.TEMPORARY_FAILURE:
      return { tone: "error", text: copy.verifyTemporaryFailure };
    default:
      break;
  }

  if (state.error) {
    return { tone: "error", text: copy.verifyTemporaryFailure };
  }

  return null;
}
