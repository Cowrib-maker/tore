/**
 * Explicit conflict representation for doctrine and reasoning.
 */

import type { DoctrineProvenance } from "./provenance";
import {
  LegalConflictKind,
  type LegalConflictKind as LegalConflictKindType,
} from "./types";

export type LegalConflict = {
  id: string;
  kind: LegalConflictKindType;
  /** Short description of the conflict (not a legal conclusion). */
  description: string;
  /** Related doctrine / rule / issue ids. */
  subjectIds: string[];
  /** Sources that disagree, when known. */
  conflictingProvenance: DoctrineProvenance[];
  /** True when the pipeline must not assert a single resolution. */
  unresolved: boolean;
};

export function createSourceConflict(input: {
  id: string;
  description: string;
  subjectIds: string[];
  conflictingProvenance: DoctrineProvenance[];
}): LegalConflict {
  return {
    id: input.id,
    kind: LegalConflictKind.SOURCE_CONFLICT,
    description: input.description,
    subjectIds: input.subjectIds,
    conflictingProvenance: input.conflictingProvenance,
    unresolved: true,
  };
}

export function createDoctrineConflict(input: {
  id: string;
  description: string;
  subjectIds: string[];
  conflictingProvenance?: DoctrineProvenance[];
}): LegalConflict {
  return {
    id: input.id,
    kind: LegalConflictKind.DOCTRINE_CONFLICT,
    description: input.description,
    subjectIds: input.subjectIds,
    conflictingProvenance: input.conflictingProvenance ?? [],
    unresolved: true,
  };
}

export function createUnresolvedIssueConflict(input: {
  id: string;
  description: string;
  issueId: string;
}): LegalConflict {
  return {
    id: input.id,
    kind: LegalConflictKind.UNRESOLVED_ISSUE,
    description: input.description,
    subjectIds: [input.issueId],
    conflictingProvenance: [],
    unresolved: true,
  };
}
