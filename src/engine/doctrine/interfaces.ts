/**
 * Ports for doctrine storage and engine composition.
 * Default repository is empty — no invented doctrine corpus.
 */

import type {
  LegalDomainClassificationContract,
} from "./classification";
import type {
  IAdministrativeDoctrineFramework,
  ICivilDoctrineFramework,
  ICriminalDoctrineFramework,
} from "./frameworks";
import type {
  LegalDoctrine,
  LegalIssue,
  LegalRule,
  LegalTest,
} from "./models";
import type { ILegalReasoningPipeline } from "./reasoning/types";
import type { LegalDomain } from "./types";

export interface IDoctrineRepository {
  getDoctrine(id: string): LegalDoctrine | null;
  listDoctrines(domain?: LegalDomain): LegalDoctrine[];
  getTest(id: string): LegalTest | null;
  getRule(id: string): LegalRule | null;
  saveDoctrine?(doctrine: LegalDoctrine): void;
}

/** Empty in-memory store — foundation default until source-backed loaders exist. */
export class InMemoryDoctrineRepository implements IDoctrineRepository {
  private readonly doctrines = new Map<string, LegalDoctrine>();
  private readonly tests = new Map<string, LegalTest>();
  private readonly rules = new Map<string, LegalRule>();

  getDoctrine(id: string): LegalDoctrine | null {
    return this.doctrines.get(id) ?? null;
  }

  listDoctrines(domain?: LegalDomain): LegalDoctrine[] {
    const all = [...this.doctrines.values()];
    return domain ? all.filter((d) => d.domain === domain) : all;
  }

  getTest(id: string): LegalTest | null {
    return this.tests.get(id) ?? null;
  }

  getRule(id: string): LegalRule | null {
    return this.rules.get(id) ?? null;
  }

  saveDoctrine(doctrine: LegalDoctrine): void {
    this.doctrines.set(doctrine.id, doctrine);
  }

  saveTest(test: LegalTest): void {
    this.tests.set(test.id, test);
  }

  saveRule(rule: LegalRule): void {
    this.rules.set(rule.id, rule);
  }
}

export type DoctrineEngineDependencies = {
  repository: IDoctrineRepository;
  pipeline: ILegalReasoningPipeline;
  classifier: LegalDomainClassificationContract;
  criminalFramework: ICriminalDoctrineFramework;
  civilFramework: ICivilDoctrineFramework;
  administrativeFramework: IAdministrativeDoctrineFramework;
};

export type DoctrineIssueDraft = {
  statement: string;
  domain?: LegalDomain;
};

export type { LegalIssue };
