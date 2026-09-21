import type { AsyncGraphRepository } from "./async-graph-repository";
import { batchDirectRelations, type GraphRelationEvidence } from "./authority-comparison";
import {
  compareAuthorityPrecedence,
  type AuthorityPrecedenceCandidate,
  type AuthorityPrecedencePolicy,
  type AuthorityPrecedenceResult,
} from "./authority-precedence";
import { GraphEdgeType } from "./types";

/**
 * Deterministic, evidence-based conflict detection (Phase D).
 *
 * This layer NEVER claims two provisions semantically contradict each
 * other because their text differs — that is a future, separate
 * intelligence capability. It only reports what explicit graph evidence
 * (a persisted REPEALS/SUPERSEDES edge, itself sourced from a real
 * ingestion/projection, never invented here) or precedence policy
 * actually supports.
 */

export const ConflictFindingType = {
  /** An explicit REPEALS edge exists between two authorities both surfaced for one answer. */
  EXPLICIT_REPEALS: "EXPLICIT_REPEALS",
  /** An explicit SUPERSEDES edge exists between two authorities both surfaced for one answer. */
  EXPLICIT_SUPERSEDES: "EXPLICIT_SUPERSEDES",
  /** Both authorities carry an explicit, opposite temporal-force signal (one IN_FORCE, one NOT_IN_FORCE) with no graph relation to explain why both were retrieved together. */
  TEMPORAL_INCOMPATIBILITY: "TEMPORAL_INCOMPATIBILITY",
} as const;
export type ConflictFindingType = (typeof ConflictFindingType)[keyof typeof ConflictFindingType];

export const ConflictResolutionStatus = {
  /** The graph/temporal evidence is direct and unambiguous. */
  RESOLVED: "RESOLVED",
  /** Evidence of a conflict exists, but which side should govern is not determined by policy. */
  UNRESOLVED: "UNRESOLVED",
  /** Insufficient evidence to call this a conflict at all — never surfaced as a finding, documented for completeness of the type. */
  INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE",
} as const;
export type ConflictResolutionStatus =
  (typeof ConflictResolutionStatus)[keyof typeof ConflictResolutionStatus];

export type ConflictCandidate = {
  nodeId: string;
  precedence?: AuthorityPrecedenceCandidate;
};

export type ConflictFinding = {
  type: ConflictFindingType;
  leftNodeId: string;
  rightNodeId: string;
  evidence: string[];
  graphRelations: GraphRelationEvidence[];
  precedence: AuthorityPrecedenceResult | null;
  resolutionStatus: ConflictResolutionStatus;
  explanation: string;
};

const REPEAL_LIKE_EDGE_TYPES = new Set<string>([GraphEdgeType.REPEALS, GraphEdgeType.SUPERSEDES]);

/**
 * Checks a bounded set of authorities (typically the 1–3 resolved for one
 * chat turn — see resolve-legal-authorities.ts's MAX_QUESTION_HITS) for
 * deterministic conflict evidence. One batched graph query for the whole
 * set, plus in-memory pairwise evaluation — never one query per pair, and
 * never a full-corpus scan.
 */
export async function detectAuthorityConflicts(
  repository: AsyncGraphRepository,
  authorities: readonly ConflictCandidate[],
  precedencePolicy?: AuthorityPrecedencePolicy,
): Promise<ConflictFinding[]> {
  if (authorities.length < 2) {
    return [];
  }

  const nodeIds = authorities.map((a) => a.nodeId);
  const relationsByPair = await batchDirectRelations(repository, nodeIds);

  const findings: ConflictFinding[] = [];
  for (let i = 0; i < authorities.length; i += 1) {
    for (let j = i + 1; j < authorities.length; j += 1) {
      const left = authorities[i]!;
      const right = authorities[j]!;
      const finding = evaluatePair(left, right, relationsByPair, precedencePolicy);
      if (finding) {
        findings.push(finding);
      }
    }
  }
  return findings;
}

function evaluatePair(
  left: ConflictCandidate,
  right: ConflictCandidate,
  relationsByPair: Map<string, GraphRelationEvidence[]>,
  precedencePolicy: AuthorityPrecedencePolicy | undefined,
): ConflictFinding | null {
  const leftToRight = relationsByPair.get(`${left.nodeId}|${right.nodeId}`) ?? [];
  const rightToLeft = relationsByPair.get(`${right.nodeId}|${left.nodeId}`) ?? [];
  const repealLike = [...leftToRight, ...rightToLeft].filter((relation) =>
    REPEAL_LIKE_EDGE_TYPES.has(relation.edgeType),
  );

  if (repealLike.length > 0) {
    const type = repealLike.some((relation) => relation.edgeType === GraphEdgeType.REPEALS)
      ? ConflictFindingType.EXPLICIT_REPEALS
      : ConflictFindingType.EXPLICIT_SUPERSEDES;
    return {
      type,
      leftNodeId: left.nodeId,
      rightNodeId: right.nodeId,
      evidence: repealLike.flatMap((relation) => relation.evidence),
      graphRelations: [...leftToRight, ...rightToLeft],
      precedence: null,
      // The graph relation itself is direct, positive evidence — not a
      // policy guess — so this is RESOLVED even though the precedence
      // policy was never consulted.
      resolutionStatus: ConflictResolutionStatus.RESOLVED,
      explanation:
        "Two authorities surfaced for the same answer have an explicit REPEALS/SUPERSEDES relation between them — one should not be treated as currently governing without checking which.",
    };
  }

  if (left.precedence?.force && right.precedence?.force) {
    const leftForce = left.precedence.force;
    const rightForce = right.precedence.force;
    const opposite =
      (leftForce === "IN_FORCE" && rightForce === "NOT_IN_FORCE") ||
      (leftForce === "NOT_IN_FORCE" && rightForce === "IN_FORCE");
    if (opposite) {
      const precedence = compareAuthorityPrecedence(left.precedence, right.precedence, precedencePolicy);
      return {
        type: ConflictFindingType.TEMPORAL_INCOMPATIBILITY,
        leftNodeId: left.nodeId,
        rightNodeId: right.nodeId,
        evidence: [],
        graphRelations: [],
        precedence,
        resolutionStatus: ConflictResolutionStatus.RESOLVED,
        explanation:
          "One authority is in force and the other is not, with no graph relation explaining why both were retrieved together for this answer.",
      };
    }
  }

  return null;
}
