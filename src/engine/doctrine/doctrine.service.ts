/**
 * Legal Doctrine engine facade.
 *
 * Provides classification + empty frameworks + source-backed reasoning pipeline
 * + case-analysis orchestration.
 * Does not scrape, invent Mongolian doctrine, or call LLMs as legal authority.
 */

import type { IKnowledgeRepository } from "@/engine/knowledge/types";
import {
  RuleBasedLegalDomainClassifier,
  type LegalDomainClassificationContract,
} from "./classification";
import {
  createCaseAnalysisOrchestrator,
  EmptyRuleRetriever,
  KnowledgeRuleRetriever,
  RuleBasedIssueSpotter,
  type CaseAnalysisOrchestrator,
  type CaseAnalysisRequest,
  type CaseAnalysisResult,
  type IRuleRetriever,
} from "./case-analysis";
import {
  EmptyAdministrativeDoctrineFramework,
  EmptyCivilDoctrineFramework,
  EmptyCriminalDoctrineFramework,
} from "./frameworks";
import {
  InMemoryDoctrineRepository,
  type DoctrineEngineDependencies,
  type DoctrineIssueDraft,
  type IDoctrineRepository,
} from "./interfaces";
import type { LegalIssue } from "./models";
import {
  createLegalReasoningPipeline,
  type ILegalReasoningPipeline,
  type LegalReasoningRequest,
  type LegalReasoningResult,
} from "./reasoning";
import {
  LegalDomain,
  emptyTemporal,
  type LegalDomain as LegalDomainType,
} from "./types";

export type DoctrineEngineDependenciesWithCaseAnalysis =
  DoctrineEngineDependencies & {
    ruleRetriever?: IRuleRetriever;
    caseAnalysis?: CaseAnalysisOrchestrator;
    /**
     * When provided (and ruleRetriever is not), wires
     * {@link KnowledgeRuleRetriever} over the knowledge repository.
     * Default remains EmptyRuleRetriever — no corpus load at engine create.
     */
    knowledgeRepository?: IKnowledgeRepository;
  };

export class DoctrineService {
  private readonly repository: IDoctrineRepository;
  private readonly pipeline: ILegalReasoningPipeline;
  private readonly classifier: LegalDomainClassificationContract;
  private readonly caseAnalysis: CaseAnalysisOrchestrator;
  readonly criminalFramework: DoctrineEngineDependencies["criminalFramework"];
  readonly civilFramework: DoctrineEngineDependencies["civilFramework"];
  readonly administrativeFramework: DoctrineEngineDependencies["administrativeFramework"];

  constructor(
    dependencies: DoctrineEngineDependencies & {
      caseAnalysis: CaseAnalysisOrchestrator;
    },
  ) {
    this.repository = dependencies.repository;
    this.pipeline = dependencies.pipeline;
    this.classifier = dependencies.classifier;
    this.caseAnalysis = dependencies.caseAnalysis;
    this.criminalFramework = dependencies.criminalFramework;
    this.civilFramework = dependencies.civilFramework;
    this.administrativeFramework = dependencies.administrativeFramework;
  }

  getRepository(): IDoctrineRepository {
    return this.repository;
  }

  /**
   * Draft a LegalIssue from a statement using the classification contract.
   * Does not resolve the issue or invent doctrine.
   */
  draftIssue(draft: DoctrineIssueDraft): LegalIssue {
    const classification = this.classifier.classify(draft.statement);
    const domain: LegalDomainType =
      draft.domain ?? classification.domain ?? LegalDomain.UNKNOWN;
    return {
      id: `issue:${hashStatement(draft.statement)}`,
      statement: draft.statement.trim(),
      domain,
      classification: {
        ...classification,
        domain,
      },
      temporal: emptyTemporal(),
      provenance: [],
      unresolved: true,
    };
  }

  /**
   * Run the legal reasoning pipeline. Unsupported conclusions are rejected.
   */
  reason(request: LegalReasoningRequest): LegalReasoningResult {
    return this.pipeline.run(request);
  }

  /**
   * Full case-analysis orchestration (facts → issues → doctrine → rules →
   * subsumption → conclusion). Never invents doctrine or citations.
   */
  analyzeCase(request: CaseAnalysisRequest): Promise<CaseAnalysisResult> {
    return this.caseAnalysis.analyze(request);
  }
}

export function createDoctrineEngine(
  overrides: Partial<DoctrineEngineDependenciesWithCaseAnalysis> = {},
): DoctrineService {
  const classifier =
    overrides.classifier ?? new RuleBasedLegalDomainClassifier();
  const criminalFramework =
    overrides.criminalFramework ?? new EmptyCriminalDoctrineFramework();
  const civilFramework =
    overrides.civilFramework ?? new EmptyCivilDoctrineFramework();
  const administrativeFramework =
    overrides.administrativeFramework ??
    new EmptyAdministrativeDoctrineFramework();

  const ruleRetriever =
    overrides.ruleRetriever ??
    (overrides.knowledgeRepository
      ? new KnowledgeRuleRetriever(overrides.knowledgeRepository)
      : new EmptyRuleRetriever());

  const caseAnalysis =
    overrides.caseAnalysis ??
    createCaseAnalysisOrchestrator({
      issueSpotter: new RuleBasedIssueSpotter(classifier),
      ruleRetriever,
      classifier,
      criminalFramework,
      civilFramework,
      administrativeFramework,
    });

  return new DoctrineService({
    repository: overrides.repository ?? new InMemoryDoctrineRepository(),
    pipeline: overrides.pipeline ?? createLegalReasoningPipeline(),
    classifier,
    criminalFramework,
    civilFramework,
    administrativeFramework,
    caseAnalysis,
  });
}

function hashStatement(statement: string): string {
  let h = 0;
  const s = statement.trim().toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}
