import type {
  IVerificationReportBuilder,
  ValidatorFinding,
  VerificationIssue,
  VerificationReport,
} from "./types";

/**
 * Merges validator findings into a single JSON {@link VerificationReport}.
 */
export class DefaultVerificationReportBuilder implements IVerificationReportBuilder {
  build(findings: readonly ValidatorFinding[]): VerificationReport {
    const issues: VerificationIssue[] = [];
    const validatedAuthorities: string[] = [];
    const validatedCitations: string[] = [];
    const missingAuthorities: string[] = [];

    for (const finding of findings) {
      issues.push(...finding.issues);
      validatedAuthorities.push(...finding.validatedAuthorities);
      validatedCitations.push(...finding.validatedCitations);
      missingAuthorities.push(...finding.missingAuthorities);
    }

    const errors = issues.filter((issue) => issue.severity === "error");
    const warnings = issues.filter((issue) => issue.severity === "warning");
    const missing = unique(missingAuthorities);
    const validated = unique(validatedAuthorities).filter(
      (id) => !missing.includes(id),
    );

    return {
      success: errors.length === 0,
      errors,
      warnings,
      validatedAuthorities: validated,
      validatedCitations: unique(validatedCitations),
      missingAuthorities: missing,
      confidenceScore: confidenceScore(errors.length, warnings.length),
    };
  }
}

export function confidenceScore(errorCount: number, warningCount: number): number {
  const raw = 1 - errorCount * 0.2 - warningCount * 0.05;
  return Math.round(Math.max(0, Math.min(1, raw)) * 100) / 100;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
