import type { AsyncGraphRepository } from "./async-graph-repository";
import { GraphEdgeType } from "./types";

/**
 * Deterministic repeal-chain traversal (Phase 2 of the temporal/authority
 * intelligence foundation).
 *
 * Edge direction, as actually written by projectRepealDeclaration
 * (src/application/legal-graph/project-legal-knowledge-graph.ts):
 * `fromNodeId` is the REPEALING document, `toNodeId` is the REPEALED one —
 * i.e. "A REPEALS B" is stored as edge A→B. To answer "what repealed X,
 * and was that repealer itself later repealed" this walks INCOMING
 * REPEALS/SUPERSEDES edges starting at the source node: an incoming edge
 * to node N gives N's repealer; the next hop looks for what repealed that
 * repealer, and so on. This never assumes a target exists — an unresolved
 * hop (a repeal-declaration document whose target law was never ingested,
 * so the edge's toNodeId is an external/unresolved id) simply has nothing
 * with that id as its OWN target to hop from, and traversal stops there,
 * reported as a distinct terminal reason rather than silently dropped.
 */

const REPEAL_EDGE_TYPES: readonly GraphEdgeType[] = [GraphEdgeType.REPEALS, GraphEdgeType.SUPERSEDES];

export const RepealChainTerminalReason = {
  /** The starting node itself has no incoming REPEALS/SUPERSEDES edge — never repealed, as far as the graph knows. */
  NOT_REPEALED: "NOT_REPEALED",
  /** Walked to a node with no further incoming repeal edge — the chain's true end. */
  NO_FURTHER_REPEAL: "NO_FURTHER_REPEAL",
  /** Hit the configured max depth before terminating naturally — traversal was bounded, not exhaustive. */
  MAX_DEPTH_REACHED: "MAX_DEPTH_REACHED",
  /** A node reappeared in its own chain — traversal stopped instead of looping forever. */
  CYCLE_DETECTED: "CYCLE_DETECTED",
} as const;
export type RepealChainTerminalReason =
  (typeof RepealChainTerminalReason)[keyof typeof RepealChainTerminalReason];

export type RepealChainHop = {
  /** The node being repealed at this hop. */
  repealedNodeId: string;
  repealedLabel: string;
  /** The node that repeals it, per the edge's fromNodeId — always a real, already-ingested document, since it produced the edge. */
  repealerNodeId: string;
  repealerLabel: string;
  edgeType: typeof GraphEdgeType.REPEALS | typeof GraphEdgeType.SUPERSEDES;
  evidence: string[];
};

export type RepealChainResult = {
  sourceNodeId: string;
  /** Ordered from the source outward: hop 0 repeals sourceNodeId, hop 1 repeals hop 0's repealer, etc. */
  chain: RepealChainHop[];
  /** The last node walked to that has no further incoming repeal edge of its own — the current, terminal repealer, if any. Null when NOT_REPEALED. */
  terminalNodeId: string | null;
  terminalLabel: string | null;
  terminalReason: RepealChainTerminalReason;
  /** True only when the traversal stopped because a node id repeated within this chain — the repeated id, not manufactured further. */
  cycle: { atNodeId: string } | null;
};

export type ResolveRepealChainOptions = {
  /** Hard bound on hop count — never traverses unbounded. Default 10 (generous for any real Mongolian repeal lineage; the real corpus's deepest observed chain today is 1 hop). */
  maxDepth?: number;
};

const DEFAULT_MAX_DEPTH = 10;

/**
 * Walks the chain of explicit REPEALS/SUPERSEDES edges terminating at
 * `sourceNodeId`, going backward through however many times the repealer
 * itself was later repealed. Deterministic and idempotent: calling this
 * twice against the same graph state returns the identical chain — no
 * randomness, no fuzzy matching, no manufactured targets. Bounded by
 * `options.maxDepth` and defended against cycles (a node id reappearing
 * in its own chain stops traversal rather than looping).
 */
export async function resolveRepealChain(
  repository: AsyncGraphRepository,
  sourceNodeId: string,
  options?: ResolveRepealChainOptions,
): Promise<RepealChainResult> {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const chain: RepealChainHop[] = [];
  const visited = new Set<string>([sourceNodeId]);

  let currentNodeId = sourceNodeId;
  let terminalNodeId: string | null = null;
  let terminalLabel: string | null = null;
  let terminalReason: RepealChainTerminalReason = RepealChainTerminalReason.NOT_REPEALED;
  let cycle: { atNodeId: string } | null = null;

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const incoming = await repository.incoming(currentNodeId, REPEAL_EDGE_TYPES);
    if (incoming.length === 0) {
      terminalReason =
        depth === 0 ? RepealChainTerminalReason.NOT_REPEALED : RepealChainTerminalReason.NO_FURTHER_REPEAL;
      terminalNodeId = depth === 0 ? null : currentNodeId;
      break;
    }

    // Deterministic when multiple repealers target the same node: prefer
    // the lexicographically-first edge id-equivalent ordering (fromNodeId)
    // rather than array/query order, which a database makes no guarantee
    // about. A real duplicate repealer is a genuine data question for a
    // human, not something this traversal should pick silently at random.
    const chosen = [...incoming].sort((a, b) => a.fromId.localeCompare(b.fromId))[0]!;

    const repealedNode = await repository.findNode(currentNodeId);
    const repealerNode = await repository.findNode(chosen.fromId);

    chain.push({
      repealedNodeId: currentNodeId,
      repealedLabel: repealedNode?.label ?? currentNodeId,
      repealerNodeId: chosen.fromId,
      repealerLabel: repealerNode?.label ?? chosen.fromId,
      edgeType: chosen.type as typeof GraphEdgeType.REPEALS | typeof GraphEdgeType.SUPERSEDES,
      evidence: chosen.evidence,
    });

    if (visited.has(chosen.fromId)) {
      cycle = { atNodeId: chosen.fromId };
      terminalReason = RepealChainTerminalReason.CYCLE_DETECTED;
      terminalNodeId = chosen.fromId;
      terminalLabel = repealerNode?.label ?? chosen.fromId;
      break;
    }
    visited.add(chosen.fromId);

    terminalNodeId = chosen.fromId;
    terminalLabel = repealerNode?.label ?? chosen.fromId;
    currentNodeId = chosen.fromId;

    if (depth === maxDepth - 1) {
      terminalReason = RepealChainTerminalReason.MAX_DEPTH_REACHED;
    }
  }

  return {
    sourceNodeId,
    chain,
    terminalNodeId,
    terminalLabel,
    terminalReason,
    cycle,
  };
}
