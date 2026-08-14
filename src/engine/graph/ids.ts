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

function normalizeIdPart(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}
