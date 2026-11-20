import { redirect } from "next/navigation";

import { DomainError } from "@/domain/errors/domain-error";

export type LoadedOrForbidden<T> = { kind: "ok"; value: T } | { kind: "forbidden" };

/**
 * Runs a page's data load and maps the two EXPECTED domain failures, leaving everything else to the framework:
 *  - FORBIDDEN (someone else's case) → `{ kind: "forbidden" }`, so the page renders its own "no access" state;
 *  - NOT_FOUND → redirect to `notFoundHref`;
 *  - any other error is rethrown unchanged.
 * Keeping the try/catch here means pages never construct JSX inside try/catch (React's error-boundary rule: JSX built there is not
 * caught by it, which makes the pattern misleading).
 */
export async function loadOrForbidden<T>(
  load: () => Promise<T>,
  notFoundHref = "/lawyer/workspace/cases",
): Promise<LoadedOrForbidden<T>> {
  try {
    return { kind: "ok", value: await load() };
  } catch (error) {
    if (error instanceof DomainError && error.code === "FORBIDDEN") return { kind: "forbidden" };
    if (error instanceof DomainError && error.code === "NOT_FOUND") redirect(notFoundHref);
    throw error;
  }
}
