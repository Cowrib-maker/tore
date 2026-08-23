import { DomainError } from "@/domain/errors/domain-error";
import {
  BILLING_FORBIDDEN_MESSAGE,
  BILLING_NOT_FOUND_MESSAGE,
  BILLING_UNAUTHORIZED_MESSAGE,
  BILLING_UNEXPECTED_MESSAGE,
} from "@/application/common/public-service-errors";

export function parseQpayCallbackInvoiceId(rawBody: string, url: URL): string | null {
  const fromQuery = url.searchParams.get("invoice_id")?.trim();
  if (rawBody) {
    try {
      const json = JSON.parse(rawBody) as { invoice_id?: unknown };
      if (typeof json.invoice_id === "string" && json.invoice_id.trim()) {
        return json.invoice_id.trim();
      }
    } catch {
      const params = new URLSearchParams(rawBody);
      const fromForm = params.get("invoice_id")?.trim();
      if (fromForm) return fromForm;
    }
  }
  return fromQuery || null;
}

export function billingApiErrorResponse(error: unknown): Response {
  if (error instanceof DomainError) {
    const status =
      error.code === "VALIDATION_ERROR" ? 400 : error.statusCode;
    const message =
      error.code === "NOT_FOUND"
        ? BILLING_NOT_FOUND_MESSAGE
        : error.code === "FORBIDDEN"
          ? BILLING_FORBIDDEN_MESSAGE
          : error.code === "UNAUTHORIZED"
            ? BILLING_UNAUTHORIZED_MESSAGE
            : error.message;
    return Response.json({ error: message, code: error.code }, { status });
  }
  console.error(error);
  return Response.json({ error: BILLING_UNEXPECTED_MESSAGE }, { status: 500 });
}
