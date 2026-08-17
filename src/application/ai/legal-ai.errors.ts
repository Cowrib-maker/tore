export class LegalAiError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 401 | 404 | 500,
  ) {
    super(message);
    this.name = "LegalAiError";
  }
}
