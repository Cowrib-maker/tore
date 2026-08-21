/**
 * Runs the existing case-analysis engine. No browser-side reasoning.
 */

import {
  EmptyAdministrativeDoctrineFramework,
  EmptyCivilDoctrineFramework,
  EmptyCriminalDoctrineFramework,
  InMemoryRuleRetriever,
  NullLegalReasoningModel,
  RuleBasedIssueSpotter,
  RuleBasedLegalDomainClassifier,
  createCaseAnalysisOrchestrator,
  type CaseAnalysisRequest,
  type CaseAnalysisResult,
  type RetrievedLegalRule,
} from "@/engine/doctrine";

export function createReviewAnalysisOrchestrator(
  retrievedRules: readonly RetrievedLegalRule[],
) {
  const retriever = new InMemoryRuleRetriever();
  for (const entry of retrievedRules) {
    retriever.register(entry);
  }
  const classifier = new RuleBasedLegalDomainClassifier();
  return createCaseAnalysisOrchestrator({
    issueSpotter: new RuleBasedIssueSpotter(classifier),
    ruleRetriever: retriever,
    classifier,
    criminalFramework: new EmptyCriminalDoctrineFramework(),
    civilFramework: new EmptyCivilDoctrineFramework(),
    administrativeFramework: new EmptyAdministrativeDoctrineFramework(),
    assistiveModel: new NullLegalReasoningModel(),
  });
}

export async function runCaseAnalysis(
  request: CaseAnalysisRequest,
  retrievedRules: readonly RetrievedLegalRule[],
): Promise<CaseAnalysisResult> {
  return createReviewAnalysisOrchestrator(retrievedRules).analyze(request);
}
