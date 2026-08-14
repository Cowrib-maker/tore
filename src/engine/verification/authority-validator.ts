import { documentGraphId, provisionGraphId } from "../graph/ids";
import type { LegalDocument, LegalNode } from "../knowledge/schema";
import { allPlanAuthorities } from "./citation-validator";
import type {
  IAuthorityValidator,
  ValidatorFinding,
  VerificationIssue,
  VerificationRequest,
} from "./types";

/**
 * Checks that referenced authorities exist in retrieved documents
 * and in the Knowledge Graph.
 */
export class DefaultAuthorityValidator implements IAuthorityValidator {
  validate(request: VerificationRequest): ValidatorFinding {
    const issues: VerificationIssue[] = [];
    const validatedAuthorities: string[] = [];
    const missingAuthorities: string[] = [];
    const documentNodes = flattenDocuments(request.documents);

    for (const authority of allPlanAuthorities(request.plan)) {
      const inDocuments = documentNodes.has(authority.id);
      const graphNode = findGraphNode(
        request.graph,
        authority.id,
        request.documents,
      );
      if (!inDocuments && !graphNode) {
        issues.push({
          code: "authority_not_found",
          message: `Authority does not exist: ${authority.id}`,
          severity: "error",
          authorityId: authority.id,
        });
        missingAuthorities.push(authority.id);
        continue;
      }
      if (!graphNode) {
        issues.push({
          code: "authority_not_in_graph",
          message: `Authority is not in the knowledge graph: ${authority.id}`,
          severity: "error",
          authorityId: authority.id,
        });
        missingAuthorities.push(authority.id);
        continue;
      }
      validatedAuthorities.push(authority.id);
    }

    if (
      request.plan.confidenceRequirements.requirePrimaryAuthority &&
      request.plan.relatedArticles.length === 0 &&
      !request.plan.relevantAuthorities.some((item) =>
        isProvisionKind(item.kind),
      )
    ) {
      issues.push({
        code: "missing_supporting_authority",
        message: "No supporting legal provision was supplied.",
        severity: "error",
      });
    }

    return {
      issues,
      validatedAuthorities: [...new Set(validatedAuthorities)],
      validatedCitations: [],
      missingAuthorities: [...new Set(missingAuthorities)],
    };
  }
}

export function flattenDocuments(
  documents: readonly LegalDocument[],
): Map<string, { document: LegalDocument; node: LegalNode }> {
  const map = new Map<string, { document: LegalDocument; node: LegalNode }>();
  for (const document of documents) {
    walk(document.hierarchy, (node) => {
      map.set(node.id, { document, node });
    });
  }
  return map;
}

export function findGraphNode(
  graph: VerificationRequest["graph"],
  id: string,
  documents: readonly LegalDocument[],
) {
  const direct = graph.findNode(id);
  if (direct) {
    return direct;
  }
  const asDocument = graph.findNode(documentGraphId(id));
  if (asDocument) {
    return asDocument;
  }
  for (const document of documents) {
    const provision = graph.findNode(provisionGraphId(document.identity.id, id));
    if (provision) {
      return provision;
    }
  }
  return null;
}

function walk(nodes: LegalNode[], visit: (node: LegalNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function isProvisionKind(kind: string): boolean {
  return (
    kind === "ARTICLE" ||
    kind === "PARAGRAPH" ||
    kind === "SUBPARAGRAPH" ||
    kind === "PROVISION"
  );
}
