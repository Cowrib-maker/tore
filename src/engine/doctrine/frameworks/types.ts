/**
 * Domain-framework interfaces for Criminal / Civil / Administrative doctrine.
 *
 * Contracts only — no Mongolian (or other) doctrine corpus.
 */

import type {
  LegalConclusion,
  LegalDoctrine,
  LegalEvidence,
  LegalFact,
  LegalIssue,
  LegalRule,
  LegalTest,
} from "../models";
import type { TemporalApplicability } from "../types";

export type FrameworkContext = {
  facts: readonly LegalFact[];
  temporal: TemporalApplicability;
};

export type FrameworkIssueSelection = {
  issues: LegalIssue[];
  notes: string[];
};

export type FrameworkTestSelection = {
  tests: LegalTest[];
  doctrines: LegalDoctrine[];
  rules: LegalRule[];
  notes: string[];
};

/**
 * Criminal-domain doctrine application port.
 * Implementations load source-backed doctrine later; defaults return empty sets.
 */
export interface ICriminalDoctrineFramework {
  readonly domain: "CRIMINAL";
  identifyIssues(context: FrameworkContext): FrameworkIssueSelection;
  selectApplicableDoctrine(
    issue: LegalIssue,
    context: FrameworkContext,
  ): FrameworkTestSelection;
  /**
   * May propose a conclusion structure; never asserts acceptance without
   * source-backed validation in the reasoning pipeline.
   */
  proposeConclusionStructure(
    issue: LegalIssue,
    selection: FrameworkTestSelection,
  ): Pick<LegalConclusion, "issueId" | "statement" | "llmGeneratedAlone"> | null;
}

export interface ICivilDoctrineFramework {
  readonly domain: "CIVIL";
  identifyIssues(context: FrameworkContext): FrameworkIssueSelection;
  selectApplicableDoctrine(
    issue: LegalIssue,
    context: FrameworkContext,
  ): FrameworkTestSelection;
  proposeConclusionStructure(
    issue: LegalIssue,
    selection: FrameworkTestSelection,
  ): Pick<LegalConclusion, "issueId" | "statement" | "llmGeneratedAlone"> | null;
}

export interface IAdministrativeDoctrineFramework {
  readonly domain: "ADMINISTRATIVE";
  identifyIssues(context: FrameworkContext): FrameworkIssueSelection;
  selectApplicableDoctrine(
    issue: LegalIssue,
    context: FrameworkContext,
  ): FrameworkTestSelection;
  proposeConclusionStructure(
    issue: LegalIssue,
    selection: FrameworkTestSelection,
  ): Pick<LegalConclusion, "issueId" | "statement" | "llmGeneratedAlone"> | null;
}

/** Empty scaffolding — safe default until source-backed doctrine is loaded. */
export class EmptyCriminalDoctrineFramework
  implements ICriminalDoctrineFramework
{
  readonly domain = "CRIMINAL" as const;

  identifyIssues(): FrameworkIssueSelection {
    return { issues: [], notes: ["no criminal doctrine corpus loaded"] };
  }

  selectApplicableDoctrine(): FrameworkTestSelection {
    return {
      tests: [],
      doctrines: [],
      rules: [],
      notes: ["no criminal doctrine corpus loaded"],
    };
  }

  proposeConclusionStructure(): null {
    return null;
  }
}

export class EmptyCivilDoctrineFramework implements ICivilDoctrineFramework {
  readonly domain = "CIVIL" as const;

  identifyIssues(): FrameworkIssueSelection {
    return { issues: [], notes: ["no civil doctrine corpus loaded"] };
  }

  selectApplicableDoctrine(): FrameworkTestSelection {
    return {
      tests: [],
      doctrines: [],
      rules: [],
      notes: ["no civil doctrine corpus loaded"],
    };
  }

  proposeConclusionStructure(): null {
    return null;
  }
}

export class EmptyAdministrativeDoctrineFramework
  implements IAdministrativeDoctrineFramework
{
  readonly domain = "ADMINISTRATIVE" as const;

  identifyIssues(): FrameworkIssueSelection {
    return { issues: [], notes: ["no administrative doctrine corpus loaded"] };
  }

  selectApplicableDoctrine(): FrameworkTestSelection {
    return {
      tests: [],
      doctrines: [],
      rules: [],
      notes: ["no administrative doctrine corpus loaded"],
    };
  }

  proposeConclusionStructure(): null {
    return null;
  }
}
