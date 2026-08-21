/**
 * Legal Doctrine engine facade.
 *
 * Provides classification + empty frameworks + source-backed reasoning pipeline.
 * Does not scrape, invent Mongolian doctrine, or call LLMs.
 */

import {
  RuleBasedLegalDomainClassifier,
  type LegalDomainClassificationContract,
} from "./classification";
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

export class DoctrineService {
  private readonly repository: IDoctrineRepository;
  private readonly pipeline: ILegalReasoningPipeline;
  private readonly classifier: LegalDomainClassificationContract;
  readonly criminalFramework: DoctrineEngineDependencies["criminalFramework"];
  readonly civilFramework: DoctrineEngineDependencies["civilFramework"];
  readonly administrativeFramework: DoctrineEngineDependencies["administrativeFramework"];

  constructor(dependencies: DoctrineEngineDependencies) {
    this.repository = dependencies.repository;
    this.pipeline = dependencies.pipeline;
    this.classifier = dependencies.classifier;
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
}

export function createDoctrineEngine(
  overrides: Partial<DoctrineEngineDependencies> = {},
): DoctrineService {
  return new DoctrineService({
    repository: overrides.repository ?? new InMemoryDoctrineRepository(),
    pipeline: overrides.pipeline ?? createLegalReasoningPipeline(),
    classifier: overrides.classifier ?? new RuleBasedLegalDomainClassifier(),
    criminalFramework:
      overrides.criminalFramework ?? new EmptyCriminalDoctrineFramework(),
    civilFramework:
      overrides.civilFramework ?? new EmptyCivilDoctrineFramework(),
    administrativeFramework:
      overrides.administrativeFramework ??
      new EmptyAdministrativeDoctrineFramework(),
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
