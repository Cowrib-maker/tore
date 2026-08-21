/**
 * Read-only case-analysis review projection for a future lawyer UI.
 * Does not decide the case and does not invent doctrine.
 */

import type { LegalEvidence, LegalFact } from "../models";
import type { CaseAnalysisResult, CaseAnalysisReview } from "./types";

export function buildCaseAnalysisReview(
  result: Pick<
    CaseAnalysisResult,
    | "selectedIssue"
    | "candidateIssues"
    | "domain"
    | "retrievedRules"
    | "selectedRule"
    | "legalTest"
    | "extractedTest"
    | "mappings"
    | "subsumption"
    | "conclusion"
  >,
  input: {
    facts: readonly LegalFact[];
    evidence: readonly LegalEvidence[];
  },
): CaseAnalysisReview {
  const statusByElement = new Map(
    result.subsumption.applications.map((a) => [a.element.id, a.result]),
  );

  return {
    issues: result.selectedIssue
      ? [
          {
            id: result.selectedIssue.id,
            statement: result.selectedIssue.statement,
            domain: result.selectedIssue.domain,
            kind: result.candidateIssues[0]?.kind ?? null,
            status: result.conclusion.disposition,
          },
        ]
      : result.candidateIssues.map((c) => ({
          id: c.kind,
          statement: c.label,
          domain: result.domain,
          kind: c.kind,
          status: result.conclusion.disposition,
        })),
    rules: result.retrievedRules.map((r) => ({
      id: r.rule.id,
      statement: r.rule.statement,
      sourceId: r.sourceId,
      sourceUrl: r.sourceUrl,
      officialUrl: r.officialUrl,
      legalDocumentId: r.legalDocumentId,
      articleId: r.articleId,
      articleNumber: r.articleNumber,
      title: r.title,
      sourceType: "POSITIVE_LAW",
      sourceVersion: r.temporal.sourceVersion,
      validFrom: r.temporal.validFrom,
      validTo: r.temporal.validTo,
      supportStatus: r.supportStatus,
      confidence: r.confidence,
    })),
    tests: result.legalTest
      ? [
          {
            id: result.legalTest.id,
            name: result.legalTest.name,
            ruleId: result.legalTest.ruleId,
            extractionKind: result.extractedTest?.extractionKind ?? null,
            extractionStatus: result.extractedTest?.extractionStatus ?? null,
            provenance: result.extractedTest
              ? [
                  result.extractedTest.sourceId,
                  result.extractedTest.articleNumber
                    ? `art. ${result.extractedTest.articleNumber}`
                    : null,
                  result.extractedTest.notes.join(" "),
                ]
                  .filter(Boolean)
                  .join(" · ")
              : null,
          },
        ]
      : [],
    elements: (result.legalTest?.elements ?? []).map((el) => ({
      id: el.id,
      label: el.label,
      description: el.description,
      required: el.required,
      order: el.order,
      status: statusByElement.get(el.id) ?? "NOT_EVALUATED",
    })),
    facts: input.facts.map((f) => ({
      id: f.id,
      statement: f.statement,
      disputed: f.disputed,
    })),
    evidence: input.evidence.map((e) => ({
      id: e.id,
      factId: e.factId,
      description: e.description,
      sourceId: e.sourceId,
    })),
    mappings: result.mappings,
    subsumption: result.subsumption.applications,
    conclusions: [result.conclusion],
  };
}
