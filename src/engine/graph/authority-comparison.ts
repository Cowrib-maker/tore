import type { AsyncGraphRepository } from "./async-graph-repository";
import {
  compareAuthorityPrecedence,
  type AuthorityPrecedenceCandidate,
  type AuthorityPrecedencePolicy,
  type AuthorityPrecedenceResult,
} from "./authority-precedence";
import { GraphEdgeType, type GraphEdgeType as GraphEdgeTypeValue } from "./types";

/**
 * Graph-backed comparison of two legal authorities (Phase C).
 *
 * Deterministic and evidence-only: it reports what the graph actually
 * contains between two nodes, never infers a relation from names, dates,
 * or subject-matter similarity. With zero persisted edges (the graph's
 * current state until a projection is run against real corpus data),
 * every comparison below correctly resolves to INSUFFICIENT_EVIDENCE or
 * UNKNOWN rather than a fabricated result — that is the intended
 * behavior, not a bug.
 */

export const AuthorityComparisonResolution = {
  /** A direct graph relation was found between the two authorities. */
  RESOLVED: "RESOLVED",
  /** No direct relation, but a precedence input let nominal tier decide — not verified by evidence. */
  UNRESOLVED: "UNRESOLVED",
  /** Neither node could be found in the graph — nothing to compare at all. */
  UNKNOWN: "UNKNOWN",
  /** Both nodes exist, but there is no relation and no precedence input. */
  INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE",
} as const;
export type AuthorityComparisonResolution =
  (typeof AuthorityComparisonResolution)[keyof typeof AuthorityComparisonResolution];

/** Edge types actually consulted for a comparison — CONTAINS is structural, not evidentiary between two authorities, so it's excluded. */
export const COMPARABLE_EDGE_TYPES: readonly GraphEdgeTypeValue[] = [
  GraphEdgeType.CITES,
  GraphEdgeType.REFERS_TO,
  GraphEdgeType.AMENDS,
  GraphEdgeType.REPEALS,
  GraphEdgeType.SUPERSEDES,
  GraphEdgeType.IMPLEMENTS,
  GraphEdgeType.INTERPRETS,
  GraphEdgeType.APPLIES,
  GraphEdgeType.RELATED_TO,
];

export type GraphRelationEvidence = {
  edgeType: GraphEdgeTypeValue;
  direction: "LEFT_TO_RIGHT" | "RIGHT_TO_LEFT";
  evidence: string[];
};

export type AuthorityComparisonSide = {
  nodeId: string;
  precedence?: AuthorityPrecedenceCandidate;
};

export type AuthorityComparison = {
  leftNodeId: string;
  rightNodeId: string;
  graphRelations: GraphRelationEvidence[];
  precedence: AuthorityPrecedenceResult | null;
  resolutionStatus: AuthorityComparisonResolution;
  explanation: string;
};

export async function compareAuthoritiesByGraph(
  repository: AsyncGraphRepository,
  left: AuthorityComparisonSide,
  right: AuthorityComparisonSide,
  precedencePolicy?: AuthorityPrecedencePolicy,
): Promise<AuthorityComparison> {
  const [graphRelations, leftNode, rightNode] = await Promise.all([
    directRelations(repository, left.nodeId, right.nodeId),
    repository.findNode(left.nodeId),
    repository.findNode(right.nodeId),
  ]);

  const precedence =
    left.precedence && right.precedence
      ? compareAuthorityPrecedence(left.precedence, right.precedence, precedencePolicy)
      : null;

  const bothNodesExist = leftNode !== null && rightNode !== null;
  const resolutionStatus = resolve(bothNodesExist, graphRelations.length > 0, precedence !== null);

  return {
    leftNodeId: left.nodeId,
    rightNodeId: right.nodeId,
    graphRelations,
    precedence,
    resolutionStatus,
    explanation: explain(resolutionStatus, graphRelations.length),
  };
}

/**
 * One batched query for outgoing edges from BOTH nodes, then partitioned
 * in memory — never two separate round trips for a single-pair
 * comparison, and callers comparing many authorities should prefer
 * batchDirectRelations below instead of calling this in a loop.
 */
async function directRelations(
  repository: AsyncGraphRepository,
  leftNodeId: string,
  rightNodeId: string,
): Promise<GraphRelationEvidence[]> {
  const edges = await repository.outgoingForMany([leftNodeId, rightNodeId], COMPARABLE_EDGE_TYPES);
  const relations: GraphRelationEvidence[] = [];
  for (const edge of edges) {
    if (edge.fromId === leftNodeId && edge.toId === rightNodeId) {
      relations.push({ edgeType: edge.type, direction: "LEFT_TO_RIGHT", evidence: edge.evidence });
    } else if (edge.fromId === rightNodeId && edge.toId === leftNodeId) {
      relations.push({ edgeType: edge.type, direction: "RIGHT_TO_LEFT", evidence: edge.evidence });
    }
  }
  return relations;
}

/**
 * Batched direct-relation lookup across an arbitrary bounded set of
 * authorities (e.g. everything resolved for one answer): one query for
 * all outgoing edges among the set, never one query per pair. Returns a
 * lookup keyed by `"<fromNodeId>|<toNodeId>"` so callers can pull out
 * whichever pairs they need without re-querying.
 */
export async function batchDirectRelations(
  repository: AsyncGraphRepository,
  nodeIds: readonly string[],
): Promise<Map<string, GraphRelationEvidence[]>> {
  const idSet = new Set(nodeIds);
  const edges = await repository.outgoingForMany(nodeIds, COMPARABLE_EDGE_TYPES);
  const byPair = new Map<string, GraphRelationEvidence[]>();
  for (const edge of edges) {
    if (!idSet.has(edge.toId)) {
      continue;
    }
    const key = `${edge.fromId}|${edge.toId}`;
    const bucket = byPair.get(key) ?? [];
    bucket.push({ edgeType: edge.type, direction: "LEFT_TO_RIGHT", evidence: edge.evidence });
    byPair.set(key, bucket);
  }
  return byPair;
}

function resolve(
  bothNodesExist: boolean,
  hasRelation: boolean,
  hasPrecedence: boolean,
): AuthorityComparisonResolution {
  if (!bothNodesExist) {
    return AuthorityComparisonResolution.UNKNOWN;
  }
  if (hasRelation) {
    return AuthorityComparisonResolution.RESOLVED;
  }
  if (hasPrecedence) {
    return AuthorityComparisonResolution.UNRESOLVED;
  }
  return AuthorityComparisonResolution.INSUFFICIENT_EVIDENCE;
}

function explain(resolution: AuthorityComparisonResolution, relationCount: number): string {
  switch (resolution) {
    case AuthorityComparisonResolution.RESOLVED:
      return `Found ${relationCount} direct graph relation(s) between these authorities.`;
    case AuthorityComparisonResolution.UNRESOLVED:
      return "No direct graph relation exists between these authorities; precedence is based on nominal tier only, not verified.";
    case AuthorityComparisonResolution.UNKNOWN:
      return "One or both authorities could not be found in the graph — nothing to compare.";
    default:
      return "Both authorities exist in the graph, but there is no relation and no precedence evidence between them.";
  }
}
