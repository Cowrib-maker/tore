import { DomainError } from "@/domain/errors/domain-error";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: DomainError };

export function success<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

export function failure<T>(error: DomainError): ActionResult<T> {
  return { success: false, error };
}

export async function wrapAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return success(data);
  } catch (error) {
    if (error instanceof DomainError) {
      return failure(error);
    }
    throw error;
  }
}
