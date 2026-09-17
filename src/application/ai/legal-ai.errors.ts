export type LegalAiErrorCode = "AI_NOT_CONFIGURED" | "AI_UNAVAILABLE" | "AI_ABORTED";

export class LegalAiError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 401 | 403 | 404 | 500 | 503,
    readonly code?: LegalAiErrorCode,
  ) {
    super(message);
    this.name = "LegalAiError";
  }
}
