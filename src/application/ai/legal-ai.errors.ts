export class LegalAiError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 401 | 403 | 404 | 500,
  ) {
    super(message);
    this.name = "LegalAiError";
  }
}
