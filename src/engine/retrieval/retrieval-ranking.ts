import type { IRetrievalRanker, RetrievalHit } from "./types";

/**
 * Deterministic ranker: highest score first, then stable id order.
 * Duplicate ids keep the strongest hit.
 */
export class DefaultRetrievalRanker implements IRetrievalRanker {
  rank(hits: readonly RetrievalHit[]): RetrievalHit[] {
    const best = new Map<string, RetrievalHit>();
    for (const hit of hits) {
      const existing = best.get(hit.id);
      if (!existing || hit.score > existing.score) {
        best.set(hit.id, hit);
        continue;
      }
      if (hit.score === existing.score && hit.strategy === existing.strategy) {
        best.set(hit.id, mergeNeighborMeta(existing, hit));
      }
    }
    return [...best.values()].sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.id.localeCompare(right.id);
    });
  }
}

function mergeNeighborMeta(
  current: RetrievalHit,
  incoming: RetrievalHit,
): RetrievalHit {
  if (current.edgeType || !incoming.edgeType) {
    return current;
  }
  return {
    ...current,
    edgeType: incoming.edgeType,
    direction: incoming.direction,
  };
}
