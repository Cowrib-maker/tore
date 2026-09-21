import { createHash } from "node:crypto";

export function documentGraphId(documentId: string): string {
  return `graph:doc:${documentId}`;
}

export function provisionGraphId(documentId: string, legalNodeId: string): string {
  return `graph:node:${documentId}:${legalNodeId}`;
}

export function externalGraphId(scheme: string, value: string): string {
  return `graph:ext:${scheme}:${normalizeIdPart(value)}`;
}

export function unresolvedGraphId(rawText: string): string {
  const digest = createHash("sha256")
    .update(rawText.normalize("NFC").trim())
    .digest("hex")
    .slice(0, 16);
  return `graph:ref:${digest}`;
}

export function graphEdgeId(
  fromId: string,
  type: string,
  toId: string,
): string {
  return `graph:edge:${fromId}:${type}:${toId}`;
}

export type ParsedGraphNodeId =
  | { kind: "document"; documentId: string }
  | { kind: "provision"; documentId: string; legalNodeId: string }
  | { kind: "external"; scheme: string; value: string }
  | { kind: "unresolved"; digest: string }
  | { kind: "unknown" };

/**
 * Inverse of documentGraphId/provisionGraphId/externalGraphId/unresolvedGraphId.
 * Used by a persistence adapter to know which table to resolve a node
 * against without a separate nodes table. Best-effort: an id built by a
 * future id scheme this function doesn't recognize returns `unknown`
 * rather than throwing.
 */
export function parseGraphNodeId(id: string): ParsedGraphNodeId {
  const docMatch = /^graph:doc:(.+)$/.exec(id);
  if (docMatch) {
    return { kind: "document", documentId: docMatch[1]! };
  }
  const provisionMatch = /^graph:node:([^:]+):(.+)$/.exec(id);
  if (provisionMatch) {
    return {
      kind: "provision",
      documentId: provisionMatch[1]!,
      legalNodeId: provisionMatch[2]!,
    };
  }
  const externalMatch = /^graph:ext:([^:]+):(.+)$/.exec(id);
  if (externalMatch) {
    return { kind: "external", scheme: externalMatch[1]!, value: externalMatch[2]! };
  }
  const unresolvedMatch = /^graph:ref:(.+)$/.exec(id);
  if (unresolvedMatch) {
    return { kind: "unresolved", digest: unresolvedMatch[1]! };
  }
  return { kind: "unknown" };
}

function normalizeIdPart(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}
