import { describe, expect, it, vi } from "vitest";

import {
  EmptyCivilDoctrineFramework,
  EmptyCriminalDoctrineFramework,
  EmptyRuleRetriever,
  RuleBasedIssueSpotter,
  RuleBasedLegalDomainClassifier,
  SourceBackedAdministrativeDoctrineFramework,
  analyzeAdministrativeCase,
  createCaseAnalysisOrchestrator,
} from "@/engine/doctrine";
import {
  APPLICABLE_AT,
  CASE1_ADMISSIBILITY_EVIDENCE,
  CASE1_ADMISSIBILITY_FACTS,
  MICRO1_PARDON_EVIDENCE,
  MICRO1_PARDON_FACTS,
} from "./helpers/administrative-fixtures";

/**
 * `analyzeAdministrativeCase` is THE canonical single entry point (final
 * gate review §2): one call runs admissibility, then — only if it
 * passes — delegates to the existing, unmodified CaseAnalysisOrchestrator.
 * No caller sequences two calls itself.
 */
function buildOrchestrator() {
  const classifier = new RuleBasedLegalDomainClassifier();
  return createCaseAnalysisOrchestrator({
    issueSpotter: new RuleBasedIssueSpotter(classifier),
    ruleRetriever: new EmptyRuleRetriever(),
    classifier,
    criminalFramework: new EmptyCriminalDoctrineFramework(),
    civilFramework: new EmptyCivilDoctrineFramework(),
    administrativeFramework: new SourceBackedAdministrativeDoctrineFramework(),
  });
}

describe("analyzeAdministrativeCase — single canonical entry point", () => {
  it("short-circuits on inadmissibility WITHOUT calling the orchestrator", async () => {
    const orchestrator = buildOrchestrator();
    const analyzeSpy = vi.spyOn(orchestrator, "analyze");

    const result = await analyzeAdministrativeCase(
      {
        facts: MICRO1_PARDON_FACTS,
        evidence: MICRO1_PARDON_EVIDENCE,
        applicableAt: APPLICABLE_AT,
        merits: { facts: MICRO1_PARDON_FACTS, evidence: MICRO1_PARDON_EVIDENCE, applicableAt: APPLICABLE_AT },
      },
      orchestrator,
    );

    expect(result.admissible).toBe(false);
    expect(result.merits).toBeNull();
    expect(analyzeSpy).not.toHaveBeenCalled();
  });

  it("delegates to the unmodified orchestrator exactly once when admissible", async () => {
    const orchestrator = buildOrchestrator();
    const analyzeSpy = vi.spyOn(orchestrator, "analyze");

    const merits = {
      facts: CASE1_ADMISSIBILITY_FACTS,
      evidence: CASE1_ADMISSIBILITY_EVIDENCE,
      applicableAt: APPLICABLE_AT,
    };
    const result = await analyzeAdministrativeCase(
      {
        facts: CASE1_ADMISSIBILITY_FACTS,
        evidence: CASE1_ADMISSIBILITY_EVIDENCE,
        applicableAt: APPLICABLE_AT,
        merits,
      },
      orchestrator,
    );

    expect(result.admissible).toBe(true);
    expect(result.merits).not.toBeNull();
    expect(analyzeSpy).toHaveBeenCalledTimes(1);
    expect(analyzeSpy).toHaveBeenCalledWith(merits);
  });
});
