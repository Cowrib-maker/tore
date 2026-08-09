import { DomainError } from "@/domain/errors/domain-error";

type ActionState = {
  error?: string;
  success?: boolean;
  message?: string;
};

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
      default:
        // Validation / conflict messages are intentionally user-facing.
        return { error: error.message };
    }
  }

  console.error(error);
  return { error: "An unexpected error occurred. Please try again." };
}
