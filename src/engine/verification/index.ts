/**
 * TORE Verification Engine.
 *
 * Validates legal correctness before and after a model response.
 * Does not call LLMs, build prompts, or write to a database.
 */

export type {
  IAuthorityValidator,
  ICitationValidator,
  IConsistencyValidator,
  IVerificationReportBuilder,
  ValidatorFinding,
  VerificationIssue,
  VerificationReport,
  VerificationRequest,
  VerificationServiceDependencies,
} from "./types";

export { DefaultCitationValidator } from "./citation-validator";
export { DefaultAuthorityValidator } from "./authority-validator";
export { DefaultConsistencyValidator } from "./consistency-validator";
export { DefaultVerificationReportBuilder } from "./verification-report";
export {
  VerificationService,
  createVerificationEngine,
} from "./verification.service";
