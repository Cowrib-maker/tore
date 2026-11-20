import { DomainError } from "@/domain/errors/domain-error";

/** Client-facing message for an unreadable request body (Mongolian, like the other route validation messages). */
export const INVALID_JSON_BODY_MESSAGE = "Хүсэлтийн агуулга буруу байна. Дахин оролдоно уу.";

/**
 * Reads a request's JSON body for an API route. A body that is empty, truncated, not JSON, or not a JSON object
 * (`null`, an array, a string, a number) is a CLIENT error: it throws a `VALIDATION_ERROR` DomainError with status 400,
 * which every route's existing error handler already turns into a controlled 4xx JSON response — instead of the
 * SyntaxError/TypeError that previously fell through to a generic 500 and a logged stack trace.
 *
 * It reads and parses only; it does not authenticate, rate-limit or authorize, so callers keep those checks first,
 * exactly where they were. The parsed value is returned untyped (`Record<string, unknown>`): callers still validate
 * each field they use.
 */
export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new DomainError(INVALID_JSON_BODY_MESSAGE, "VALIDATION_ERROR", 400);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DomainError(INVALID_JSON_BODY_MESSAGE, "VALIDATION_ERROR", 400);
  }
  return parsed as Record<string, unknown>;
}
