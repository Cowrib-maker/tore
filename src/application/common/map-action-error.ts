import type { ActionState } from "@/application/common/action-state";
import { DomainError } from "@/domain/errors/domain-error";

function isCredentialsSigninError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { type?: unknown; name?: unknown };
  return (
    candidate.type === "CredentialsSignin" ||
    candidate.name === "CredentialsSignin"
  );
}

/**
 * Maps domain/unknown errors to safe, user-facing ActionState messages.
 * Never expose internal IDs, stack traces, or infrastructure details.
 */
export function mapActionError(error: unknown): ActionState {
  if (error instanceof DomainError) {
    switch (error.code) {
      case "NOT_FOUND":
        return { error: "The requested resource was not found." };
      case "UNAUTHORIZED":
        return { error: "Please sign in to continue." };
      case "FORBIDDEN":
        return { error: "You do not have permission to perform this action." };
      case "EMAIL_NOT_VERIFIED":
        return { error: error.message };
      default:
        // Validation / conflict messages are intentionally user-facing.
        return { error: error.message };
    }
  }

  // Auth.js v5 `signIn(..., { redirect: false })` still throws CredentialsSignin
  // on failed credentials instead of returning `{ error }`.
  if (isCredentialsSigninError(error)) {
    return { error: "Invalid email or password" };
  }

  console.error(error);
  return { error: "An unexpected error occurred. Please try again." };
}
