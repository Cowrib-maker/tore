import { DomainError } from "@/domain/errors/domain-error";

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
        ? "The requested resource was not found."
        : error.code === "FORBIDDEN"
          ? "You do not have permission to perform this action."
          : error.code === "UNAUTHORIZED"
            ? "Please sign in to continue."
            : error.message;
    return Response.json({ error: message, code: error.code }, { status });
  }
  console.error(error);
  return Response.json({ error: "Unexpected error" }, { status: 500 });
}
