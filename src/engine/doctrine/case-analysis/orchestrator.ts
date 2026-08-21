/**
 * Case-analysis orchestrator.
 *
 * Legal authority comes only from Legal Data / Knowledge / Doctrine.
 * Assistive LLM port (if injected) never authorizes rules or conclusions.
 */

import type { LegalDomainClassificationContract } from "../classification";
import {
  createSourceConflict,
  createUnresolvedIssueConflict,
  type LegalConflict,
} from "../conflict";
import type {
  IAdministrativeDoctrineFramework,
  ICivilDoctrineFramework,
  ICriminalDoctrineFramework,
} from "../frameworks";
import type {
  LegalDoctrine,
  LegalIssue,
  LegalRule,
  LegalTest,
} from "../models";
import { evaluateSourceBackedSupport } from "../provenance";
import { isApplicableAt } from "../temporal";
import {
  CaseAnalysisStage,
  ConclusionDisposition,
  LegalAuthorityKind,
  LegalDomain,
  ReasoningSupportStatus,
  emptyTemporal,
  type LegalDomain as LegalDomainType,
} from "../types";
import type { IIssueSpotter } from "./issue-spotter";
import type { ILegalReasoningModel } from "./llm-port";
import {
  SourceGroundedLegalTestExtractor,
  type ExtractedLegalTest,
  type ILegalTestExtractor,
} from "./legal-test-extractor";
import {
  DeterministicFactElementMapper,
  type FactElementMapping,
  type IFactElementMapper,
} from "./fact-element-mapping";
import { buildCaseAnalysisReview } from "./review";
import {
  assertRuleSupported,
  type IRuleRetriever,
  type RetrievedLegalRule,
} from "./rule-retriever";
import {
  DefaultSubsumptionEngine,
  type ISubsumptionEngine,
} from "./subsumption";
import type {
  CaseAnalysisConclusion,
  CaseAnalysisRequest,
  CaseAnalysisResult,
  CaseAnalysisTrace,
  CaseAnalysisTraceStep,
  CaseCounterargument,
} from "./types";

export type CaseAnalysisOrchestratorDependencies = {
  issueSpotter: IIssueSpotter;
  ruleRetriever: IRuleRetriever;
  classifier: LegalDomainClassificationContract;
  criminalFramework: ICriminalDoctrineFramework;
  civilFramework: ICivilDoctrineFramework;
  administrativeFramework: IAdministrativeDoctrineFramework;
  subsumptionEngine?: ISubsumptionEngine;
  testExtractor?: ILegalTestExtractor;
  factMapper?: IFactElementMapper;
  /** Assistive only — never legal authority. */
  assistiveModel?: ILegalReasoningModel;
};

export class CaseAnalysisOrchestrator {
  private readonly issueSpotter: IIssueSpotter;
  private readonly ruleRetriever: IRuleRetriever;
  private readonly subsumptionEngine: ISubsumptionEngine;
  private readonly testExtractor: ILegalTestExtractor;
  private readonly factMapper: IFactElementMapper;
  private readonly classifier: LegalDomainClassificationContract;
  private readonly criminalFramework: ICriminalDoctrineFramework;
  private readonly civilFramework: ICivilDoctrineFramework;
  private readonly administrativeFramework: IAdministrativeDoctrineFramework;
  private readonly assistiveModel: ILegalReasoningModel | undefined;

  constructor(dependencies: CaseAnalysisOrchestratorDependencies) {
    this.issueSpotter = dependencies.issueSpotter;
    this.ruleRetriever = dependencies.ruleRetriever;
    this.subsumptionEngine =
      dependencies.subsumptionEngine ?? new DefaultSubsumptionEngine();
    this.testExtractor =
      dependencies.testExtractor ?? new SourceGroundedLegalTestExtractor();
    this.factMapper =
      dependencies.factMapper ?? new DeterministicFactElementMapper();
    this.classifier = dependencies.classifier;
    this.criminalFramework = dependencies.criminalFramework;
    this.civilFramework = dependencies.civilFramework;
    this.administrativeFramework = dependencies.administrativeFramework;
    this.assistiveModel = dependencies.assistiveModel;
  }

  async analyze(request: CaseAnalysisRequest): Promise<CaseAnalysisResult> {
    const stages: CaseAnalysisTraceStep[] = [];
    let order = 1;

    // 1. Facts
    stages.push({
      order: order++,
      stage: CaseAnalysisStage.FACTS,
      subjectIds: request.facts.map((f) => f.id),
      notes:
        request.facts.length === 0
          ? ["no facts supplied"]
          : [`${request.facts.length} fact(s) supplied`],
    });

    // 2–3. Issues + domain
    const spotting = this.issueSpotter.spot(request.facts);
    const domain: LegalDomainType =
      request.issue?.domain ?? spotting.domain ?? LegalDomain.UNKNOWN;
    stages.push({
      order: order++,
      stage: CaseAnalysisStage.LEGAL_ISSUES,
      subjectIds: spotting.candidates.map((c) => c.kind),
      notes: spotting.notes,
    });
    stages.push({
      order: order++,
      stage: CaseAnalysisStage.APPLICABLE_DOMAIN,
      subjectIds: [domain],
      notes: [`classified domain: ${domain}`],
    });

    const selectedIssue =
      request.issue ??
      (spotting.candidates[0]
        ? draftIssueFromCandidate(
            spotting.candidates[0]!.label,
            domain,
            request.applicableAt,
          )
        : null);

    // 4. Doctrine (framework selection — empty until corpus loaded)
    const framework = this.frameworkFor(domain);
    const doctrineSelection = selectedIssue
      ? framework.selectApplicableDoctrine(selectedIssue, {
          facts: request.facts,
          temporal: emptyTemporal({ applicableAt: request.applicableAt }),
        })
      : {
          tests: [] as LegalTest[],
          doctrines: [] as LegalDoctrine[],
          rules: [] as LegalRule[],
          notes: ["no issue selected — doctrine selection skipped"],
        };

    let doctrine =
      request.doctrine ??
      doctrineSelection.doctrines.find((d) =>
        isApplicableAt(d.temporal, request.applicableAt),
      ) ??
      null;

    if (
      doctrine &&
      !isApplicableAt(doctrine.temporal, request.applicableAt)
    ) {
      doctrine = null;
    }

    stages.push({
      order: order++,
      stage: CaseAnalysisStage.APPLICABLE_DOCTRINE,
      subjectIds: doctrine ? [doctrine.id] : [],
      notes: doctrine
        ? [`doctrine ${doctrine.id}`]
        : doctrineSelection.notes.length > 0
          ? [...doctrineSelection.notes]
          : ["no applicable doctrine for applicableAt"],
    });

    // 5. Rules via source-grounded retriever
    const retrievalText =
      request.retrievalQuery?.trim() ||
      selectedIssue?.statement ||
      request.facts.map((f) => f.statement).join(" ");
    const retrievedRules = await this.ruleRetriever.retrieve({
      issueStatement: selectedIssue?.statement ?? retrievalText,
      query: retrievalText,
      domain,
      issueKind:
        request.issueKind ?? spotting.candidates[0]?.kind ?? undefined,
      applicableAt: request.applicableAt,
      jurisdiction: request.jurisdiction ?? undefined,
      sourceUrl: request.sourceUrl ?? undefined,
      sourceId: request.sourceId ?? undefined,
      relatedAuthorityIds: doctrine?.relatedPositiveLawIds,
    });

    const groundedRules: RetrievedLegalRule[] = [];
    const supportedRules: RetrievedLegalRule[] = [];
    for (const entry of retrievedRules) {
      try {
        assertRuleSupported(entry);
        groundedRules.push(entry);
        if (entry.supportStatus === ReasoningSupportStatus.SOURCE_BACKED) {
          supportedRules.push(entry);
        }
      } catch {
        // Reject unsupported rules — do not invent replacements.
      }
    }

    // Prefer temporally applicable doctrine-linked rule when present
    let selectedRule: LegalRule | null =
      supportedRules[0]?.rule ??
      doctrineSelection.rules.find((r) =>
        isApplicableAt(r.temporal, request.applicableAt),
      ) ??
      null;

    if (selectedRule && !this.ruleHasAuthoritativeProvenance(selectedRule)) {
      selectedRule = null;
    }

    stages.push({
      order: order++,
      stage: CaseAnalysisStage.LEGAL_RULES,
      subjectIds: [
        ...(selectedRule ? [selectedRule.id] : []),
        ...groundedRules.flatMap((r) =>
          [r.legalDocumentId, r.articleId, r.chunkId].filter(
            (x): x is string => Boolean(x),
          ),
        ),
      ],
      notes:
        supportedRules.length === 0
          ? ["no source-backed rules retrieved for applicableAt"]
          : [
              `${supportedRules.length} grounded rule(s); selected=${selectedRule?.id ?? "none"}`,
              ...supportedRules.slice(0, 3).map(
                (r) =>
                  `doc=${r.legalDocumentId ?? "?"} art=${r.articleNumber ?? r.articleId ?? "?"} chunk=${r.chunkId ?? "?"}`,
              ),
            ],
    });

    // 6. Elements / test — caller, doctrine corpus, then source-grounded extraction
    let extractedTest: ExtractedLegalTest | null = null;
    let legalTest =
      request.legalTest ??
      doctrineSelection.tests.find((t) =>
        isApplicableAt(t.temporal, request.applicableAt),
      ) ??
      null;

    if (!legalTest && selectedRule) {
      const grounded =
        supportedRules.find((r) => r.rule.id === selectedRule!.id) ?? null;
      if (grounded) {
        extractedTest = this.testExtractor.extract(grounded, {
          domain,
          applicableAt: request.applicableAt,
        });
        if (
          extractedTest.extractionStatus === ReasoningSupportStatus.SOURCE_BACKED &&
          extractedTest.elements.length > 0 &&
          isApplicableAt(extractedTest.temporal, request.applicableAt)
        ) {
          legalTest = extractedTest;
        }
      }
    }

    if (legalTest && !isApplicableAt(legalTest.temporal, request.applicableAt)) {
      legalTest = null;
    }

    stages.push({
      order: order++,
      stage: CaseAnalysisStage.ELEMENTS_TEST,
      subjectIds: legalTest?.elements.map((e) => e.id) ?? [],
      notes: legalTest
        ? [
            `test ${legalTest.id} with ${legalTest.elements.length} element(s)`,
            ...(extractedTest
              ? [
                  `extracted from article ${extractedTest.articleNumber ?? extractedTest.articleId ?? "?"}`,
                  `extractionKind=${extractedTest.extractionKind}`,
                ]
              : ["caller or doctrine test"]),
          ]
        : extractedTest
          ? [
              "no authoritative extracted test",
              ...extractedTest.notes,
            ]
          : ["no legal test/elements available"],
    });

    // 7. Evidence
    stages.push({
      order: order++,
      stage: CaseAnalysisStage.EVIDENCE,
      subjectIds: request.evidence.map((e) => e.id),
      notes:
        request.evidence.length === 0
          ? ["no evidence supplied"]
          : [`${request.evidence.length} evidence item(s)`],
    });

    // 8. Explicit / lexical fact → element mapping
    const mappingResult = this.factMapper.map({
      facts: request.facts,
      elements: legalTest?.elements ?? [],
      evidence: request.evidence,
      applicableAt: request.applicableAt,
      testTemporal: legalTest?.temporal ?? null,
      explicitMappings: request.mappings,
    });
    const mappings: FactElementMapping[] = mappingResult.mappings;

    stages.push({
      order: order++,
      stage: CaseAnalysisStage.FACT_MAPPING,
      subjectIds: mappings.map((m) => m.id),
      notes:
        mappings.length === 0
          ? ["no fact-element mappings"]
          : [
              `${mappings.length} mapping(s)`,
              ...mappingResult.notes,
              ...mappings.slice(0, 5).map(
                (m) =>
                  `${m.factId}→${m.elementId} ${m.relation} ${m.method}/${m.confidence}`,
              ),
            ],
    });

    // 9. Subsumption
    const subsumption = this.subsumptionEngine.apply({
      legalTest,
      facts: request.facts,
      evidence: request.evidence,
      mappings,
    });
    stages.push({
      order: order++,
      stage: CaseAnalysisStage.SUBSUMPTION,
      subjectIds: subsumption.applications.map((a) => a.element.id),
      notes: [
        `requiredSatisfied=${subsumption.allRequiredSatisfied}`,
        `insufficientFacts=${subsumption.hasInsufficientFacts}`,
        `uncertainRequired=${subsumption.hasUncertainRequired}`,
        `notEvaluatedRequired=${subsumption.hasNotEvaluatedRequired}`,
      ],
    });

    // 9. Counterarguments (party / assistive — never authoritative)
    let counterarguments: CaseCounterargument[] = [
      ...(request.counterarguments ?? []),
    ].map((c) => ({ ...c, authoritative: false as const }));

    if (this.assistiveModel?.generateCandidateArguments) {
      const drafts = await this.assistiveModel.generateCandidateArguments({
        facts: request.facts,
        issues: spotting.candidates,
      });
      for (const draft of drafts) {
        counterarguments.push({
          id: `arg:${counterarguments.length + 1}`,
          statement: draft.statement,
          relatedElementIds: [],
          evidenceIds: [],
          authoritative: false,
        });
      }
    }

    stages.push({
      order: order++,
      stage: CaseAnalysisStage.COUNTERARGUMENTS,
      subjectIds: counterarguments.map((c) => c.id),
      notes:
        counterarguments.length === 0
          ? ["no counterarguments supplied"]
          : [`${counterarguments.length} non-authoritative counterargument(s)`],
    });

    // Conflicts
    const conflicts: LegalConflict[] = [...(request.conflicts ?? [])];
    if (supportedRules.length >= 2) {
      const a = supportedRules[0]!;
      const b = supportedRules[1]!;
      if (a.rule.statement !== b.rule.statement) {
        conflicts.push(
          createSourceConflict({
            id: `conflict:rules:${a.rule.id}:${b.rule.id}`,
            description: "Multiple grounded rules retrieved with differing statements",
            subjectIds: [a.rule.id, b.rule.id],
            conflictingProvenance: [
              ...a.rule.provenance,
              ...b.rule.provenance,
            ],
          }),
        );
      }
    }
    if (selectedIssue?.unresolved) {
      conflicts.push(
        createUnresolvedIssueConflict({
          id: `conflict:issue:${selectedIssue.id}`,
          description: "Selected issue is marked unresolved",
          issueId: selectedIssue.id,
        }),
      );
    }

    // 10. Conclusion safety
    const conclusion = this.decideConclusion({
      request,
      selectedIssue,
      doctrine,
      selectedRule,
      supportedRules,
      legalTest,
      subsumption,
      conflicts,
    });

    stages.push({
      order: order++,
      stage: CaseAnalysisStage.CONCLUSION,
      subjectIds: conclusion.issueId ? [conclusion.issueId] : [],
      notes: [`disposition=${conclusion.disposition}`, conclusion.statement],
    });

    const trace: CaseAnalysisTrace = {
      stages,
      issueIds: selectedIssue ? [selectedIssue.id] : [],
      doctrineIds: doctrine ? [doctrine.id] : [],
      ruleIds: selectedRule ? [selectedRule.id] : [],
      elementIds: legalTest?.elements.map((e) => e.id) ?? [],
      factIds: request.facts.map((f) => f.id),
      evidenceIds: request.evidence.map((e) => e.id),
      mappingIds: mappings.map((m) => m.id),
      subsumption: subsumption.applications,
      counterarguments,
      temporal: emptyTemporal({
        applicableAt: request.applicableAt,
        validFrom: selectedRule?.temporal.validFrom ?? doctrine?.temporal.validFrom ?? null,
        validTo: selectedRule?.temporal.validTo ?? doctrine?.temporal.validTo ?? null,
        sourceVersion:
          selectedRule?.temporal.sourceVersion ??
          doctrine?.temporal.sourceVersion ??
          null,
      }),
      ruleProvenance: groundedRules.map((r) => ({
        ruleId: r.rule.id,
        sourceId: r.sourceId,
        sourceUrl: r.sourceUrl,
        officialUrl: r.officialUrl,
        legalDocumentId: r.legalDocumentId,
        articleId: r.articleId,
        articleNumber: r.articleNumber,
        chunkId: r.chunkId,
        title: r.title,
        confidence: r.confidence,
        matchKind: r.matchKind ?? null,
      })),
      testProvenance: legalTest
        ? {
            testId: legalTest.id,
            ruleId: legalTest.ruleId,
            sourceId: extractedTest?.sourceId ?? legalTest.provenance[0]?.sourceId ?? null,
            sourceUrl: extractedTest?.sourceUrl ?? null,
            legalDocumentId: extractedTest?.legalDocumentId ?? null,
            articleId: extractedTest?.articleId ?? null,
            articleNumber: extractedTest?.articleNumber ?? null,
            extractionStatus: extractedTest?.extractionStatus ?? null,
            extractionKind: extractedTest?.extractionKind ?? null,
            elementIds: legalTest.elements.map((e) => e.id),
          }
        : null,
      mappings,
    };

    const resultWithoutReview = {
      domain,
      candidateIssues: spotting.candidates,
      selectedIssue,
      doctrine,
      retrievedRules: groundedRules,
      selectedRule,
      extractedTest,
      legalTest,
      mappings,
      subsumption,
      counterarguments,
      conflicts,
      conclusion,
      trace,
    };

    return {
      ...resultWithoutReview,
      review: buildCaseAnalysisReview(resultWithoutReview, {
        facts: request.facts,
        evidence: request.evidence,
      }),
    };
  }

  private frameworkFor(domain: LegalDomainType) {
    switch (domain) {
      case LegalDomain.CRIMINAL:
        return this.criminalFramework;
      case LegalDomain.CIVIL:
        return this.civilFramework;
      case LegalDomain.ADMINISTRATIVE:
        return this.administrativeFramework;
      default:
        return this.civilFramework;
    }
  }

  private ruleHasAuthoritativeProvenance(rule: LegalRule): boolean {
    const support = evaluateSourceBackedSupport("legal_rule", rule.provenance, {
      required: true,
    });
    if (
      support.status === "UNSUPPORTED" ||
      support.status === "INCOMPLETE" ||
      support.llmGeneratedAlone
    ) {
      return false;
    }
    return rule.provenance.some(
      (p) => p.sourceKind !== LegalAuthorityKind.AI_INFERENCE,
    );
  }

  private testHasAuthoritativeProvenance(test: LegalTest): boolean {
    const support = evaluateSourceBackedSupport("legal_rule", test.provenance, {
      required: true,
    });
    if (
      support.status === "UNSUPPORTED" ||
      support.status === "INCOMPLETE" ||
      support.llmGeneratedAlone
    ) {
      return false;
    }
    const elementsBacked = test.elements.every((el) => {
      const elSupport = evaluateSourceBackedSupport("legal_rule", el.provenance, {
        required: true,
      });
      return (
        !elSupport.llmGeneratedAlone &&
        elSupport.status !== "UNSUPPORTED" &&
        el.provenance.some((p) => p.sourceKind !== LegalAuthorityKind.AI_INFERENCE)
      );
    });
    return elementsBacked;
  }

  private decideConclusion(input: {
    request: CaseAnalysisRequest;
    selectedIssue: LegalIssue | null;
    doctrine: LegalDoctrine | null;
    selectedRule: LegalRule | null;
    supportedRules: RetrievedLegalRule[];
    legalTest: LegalTest | null;
    subsumption: ReturnType<ISubsumptionEngine["apply"]>;
    conflicts: LegalConflict[];
  }): CaseAnalysisConclusion {
    const {
      request,
      selectedIssue,
      doctrine,
      selectedRule,
      supportedRules,
      legalTest,
      subsumption,
      conflicts,
    } = input;

    const base = {
      issueId: selectedIssue?.id ?? null,
      ruleId: selectedRule?.id ?? null,
      doctrineId: doctrine?.id ?? null,
      reliedFactIds: request.facts.map((f) => f.id),
      reliedEvidenceIds: request.evidence.map((e) => e.id),
      sourceDocumentIds: [] as string[],
      articleOrChunkIds: [] as string[],
      accepted: false,
    };

    if (request.llmOnlyConclusion) {
      return {
        ...base,
        disposition: ConclusionDisposition.UNSUPPORTED,
        statement:
          "LLM-only conclusion rejected — legal authority must come from Legal Data / Knowledge / Doctrine.",
        accepted: false,
      };
    }

    const unresolvedConflicts = conflicts.filter((c) => c.unresolved);
    if (unresolvedConflicts.length > 0) {
      return {
        ...base,
        disposition: ConclusionDisposition.CONFLICTING_AUTHORITY,
        statement:
          "Conflicting or unresolved authority prevents a supported conclusion.",
        accepted: false,
      };
    }

    if (!selectedRule || !this.ruleHasAuthoritativeProvenance(selectedRule)) {
      return {
        ...base,
        disposition: ConclusionDisposition.UNSUPPORTED,
        statement:
          "No applicable rule with authoritative provenance — refusing to invent a rule or citation.",
        accepted: false,
      };
    }

    if (!legalTest || legalTest.elements.length === 0) {
      return {
        ...base,
        disposition: ConclusionDisposition.UNSUPPORTED,
        statement:
          "Required legal test/elements are unavailable — conclusion cannot be SUPPORTED.",
        accepted: false,
      };
    }

    if (!this.testHasAuthoritativeProvenance(legalTest)) {
      return {
        ...base,
        disposition: ConclusionDisposition.UNSUPPORTED,
        statement:
          "Legal test/elements lack non-AI provenance — refusing to invent a test.",
        accepted: false,
      };
    }

    if (
      request.facts.length === 0 ||
      subsumption.hasInsufficientFacts ||
      subsumption.hasNotEvaluatedRequired ||
      (!subsumption.allRequiredSatisfied && subsumption.hasUncertainRequired)
    ) {
      return {
        ...base,
        disposition: ConclusionDisposition.INSUFFICIENT_FACTS,
        statement:
          "Insufficient or uncertain factual basis for required elements.",
        accepted: false,
      };
    }

    if (!subsumption.allRequiredSatisfied) {
      return {
        ...base,
        disposition: ConclusionDisposition.UNSUPPORTED,
        statement: "Required elements are not satisfied on the supplied record.",
        accepted: false,
      };
    }

    const grounded = supportedRules.find((r) => r.rule.id === selectedRule.id);
    const sourceDocumentIds = [
      ...new Set(
        [
          grounded?.legalDocumentId,
          ...selectedRule.provenance.map((p) => p.sourceId),
        ].filter((x): x is string => Boolean(x)),
      ),
    ];
    const articleOrChunkIds = grounded?.articleOrChunkId
      ? [grounded.articleOrChunkId]
      : [];

    return {
      ...base,
      disposition: ConclusionDisposition.SUPPORTED,
      statement:
        request.proposedConclusionStatement?.trim() ||
        `Required elements of rule ${selectedRule.id} are satisfied on the supplied facts and evidence.`,
      sourceDocumentIds,
      articleOrChunkIds,
      accepted: true,
    };
  }
}

function draftIssueFromCandidate(
  label: string,
  domain: LegalDomainType,
  applicableAt: string,
): LegalIssue {
  return {
    id: `issue:candidate:${label.toLowerCase().replace(/\s+/g, "-")}`,
    statement: label,
    domain,
    classification: {
      domain,
      topics: [],
      nature: "UNKNOWN",
      confidence: 0.4,
    },
    temporal: emptyTemporal({ applicableAt }),
    provenance: [],
    unresolved: false,
  };
}

export function createCaseAnalysisOrchestrator(
  dependencies: CaseAnalysisOrchestratorDependencies,
): CaseAnalysisOrchestrator {
  return new CaseAnalysisOrchestrator(dependencies);
}
