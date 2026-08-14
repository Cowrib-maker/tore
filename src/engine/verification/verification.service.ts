import { DefaultAuthorityValidator } from "./authority-validator";
import { DefaultCitationValidator } from "./citation-validator";
import { DefaultConsistencyValidator } from "./consistency-validator";
import { DefaultVerificationReportBuilder } from "./verification-report";
import type {
  IAuthorityValidator,
  ICitationValidator,
  IConsistencyValidator,
  IVerificationReportBuilder,
  VerificationReport,
  VerificationRequest,
  VerificationServiceDependencies,
} from "./types";

/**
 * Verification Engine facade.
 *
 * Runs deterministic validators over a reasoning plan and retrieved
 * authorities. Does not call models or build prompts.
 */
export class VerificationService {
  private readonly citationValidator: ICitationValidator;
  private readonly authorityValidator: IAuthorityValidator;
  private readonly consistencyValidator: IConsistencyValidator;
  private readonly reportBuilder: IVerificationReportBuilder;

  constructor(dependencies: VerificationServiceDependencies) {
    this.citationValidator = dependencies.citationValidator;
    this.authorityValidator = dependencies.authorityValidator;
    this.consistencyValidator = dependencies.consistencyValidator;
    this.reportBuilder = dependencies.reportBuilder;
  }

  verify(request: VerificationRequest): VerificationReport {
    return this.reportBuilder.build([
      this.citationValidator.validate(request),
      this.authorityValidator.validate(request),
      this.consistencyValidator.validate(request),
    ]);
  }
}

export function createVerificationEngine(
  overrides: Partial<VerificationServiceDependencies> = {},
): VerificationService {
  return new VerificationService({
    citationValidator:
      overrides.citationValidator ?? new DefaultCitationValidator(),
    authorityValidator:
      overrides.authorityValidator ?? new DefaultAuthorityValidator(),
    consistencyValidator:
      overrides.consistencyValidator ?? new DefaultConsistencyValidator(),
    reportBuilder:
      overrides.reportBuilder ?? new DefaultVerificationReportBuilder(),
  });
}
