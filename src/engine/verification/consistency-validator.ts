import { LegalDocumentStatus, LegalNodeKind, type LegalDocument, type LegalNode } from "../knowledge/schema";
import { flattenDocuments } from "./authority-validator";
import { allPlanAuthorities } from "./citation-validator";
import type {
  IConsistencyValidator,
  ValidatorFinding,
  VerificationIssue,
  VerificationRequest,
} from "./types";

/**
 * Hierarchy, duplicate, conflict, and obsolescence checks.
 */
export class DefaultConsistencyValidator implements IConsistencyValidator {
  validate(request: VerificationRequest): ValidatorFinding {
    const issues: VerificationIssue[] = [];
    issues.push(...hierarchyIssues(request.documents));
    issues.push(...duplicateIssues(request.plan.relevantAuthorities.map((item) => item.id)));
    issues.push(...conflictIssues(request));
    issues.push(...obsoleteIssues(request));

    return {
      issues,
      validatedAuthorities: [],
      validatedCitations: [],
      missingAuthorities: [],
    };
  }
}

function hierarchyIssues(documents: readonly LegalDocument[]): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  for (const document of documents) {
    walkHierarchy(document.hierarchy, [], (node, ancestors) => {
      const parent = ancestors[ancestors.length - 1] ?? null;
      if (node.kind === LegalNodeKind.PARAGRAPH) {
        const article = nearest(ancestors, LegalNodeKind.ARTICLE);
        if (!article) {
          issues.push({
            code: "invalid_hierarchy",
            message: `Paragraph ${node.id} is not under an article.`,
            severity: "error",
            authorityId: node.id,
          });
        } else if (
          node.locator?.article &&
          article.locator?.article &&
          node.locator.article !== article.locator.article
        ) {
          issues.push({
            code: "invalid_hierarchy",
            message: `Paragraph ${node.id} article locator does not match its parent article.`,
            severity: "error",
            authorityId: node.id,
          });
        }
      }
      if (node.kind === LegalNodeKind.SUBPARAGRAPH) {
        const paragraph = nearest(ancestors, LegalNodeKind.PARAGRAPH);
        if (!paragraph) {
          issues.push({
            code: "invalid_hierarchy",
            message: `Subparagraph ${node.id} is not under a paragraph.`,
            severity: "error",
            authorityId: node.id,
          });
        }
      }
      if (
        parent &&
        node.kind === LegalNodeKind.ARTICLE &&
        parent.kind === LegalNodeKind.PARAGRAPH
      ) {
        issues.push({
          code: "invalid_hierarchy",
          message: `Article ${node.id} cannot be nested under a paragraph.`,
          severity: "error",
          authorityId: node.id,
        });
      }
    });
  }
  return issues;
}

function duplicateIssues(ids: string[]): VerificationIssue[] {
  const seen = new Set<string>();
  const issues: VerificationIssue[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      issues.push({
        code: "duplicate_authority",
        message: `Duplicate authority reference: ${id}`,
        severity: "warning",
        authorityId: id,
      });
    }
    seen.add(id);
  }
  return issues;
}

function conflictIssues(request: VerificationRequest): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  const byLabel = new Map<string, string>();
  for (const authority of allPlanAuthorities(request.plan)) {
    const key = `${authority.kind}:${authority.label}`;
    const existing = byLabel.get(key);
    if (existing && existing !== authority.id) {
      issues.push({
        code: "conflicting_authority",
        message: `Conflicting authorities for ${authority.label}`,
        severity: "error",
        authorityId: authority.id,
      });
    } else if (!existing) {
      byLabel.set(key, authority.id);
    }
  }
  return issues;
}

function obsoleteIssues(request: VerificationRequest): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  const nodes = flattenDocuments(request.documents);
  const referencedDocs = new Set<LegalDocument>();

  for (const authority of allPlanAuthorities(request.plan)) {
    const hit = nodes.get(authority.id);
    if (hit) {
      referencedDocs.add(hit.document);
    }
  }
  for (const document of request.documents) {
    if (request.plan.relevantAuthorities.some((item) => item.id === document.identity.id)) {
      referencedDocs.add(document);
    }
  }

  for (const document of referencedDocs) {
    const status = document.temporal.status;
    if (status === LegalDocumentStatus.REPEALED) {
      issues.push({
        code: "obsolete_authority",
        message: `Referenced authority is repealed: ${document.identity.id}`,
        severity: "error",
        authorityId: document.identity.id,
      });
    } else if (
      status === LegalDocumentStatus.SUPERSEDED ||
      status === LegalDocumentStatus.DRAFT
    ) {
      issues.push({
        code: "obsolete_authority",
        message: `Referenced authority is ${status.toLowerCase()}: ${document.identity.id}`,
        severity: "warning",
        authorityId: document.identity.id,
      });
    }
  }
  return issues;
}

function walkHierarchy(
  nodes: LegalNode[],
  ancestors: LegalNode[],
  visit: (node: LegalNode, ancestors: LegalNode[]) => void,
): void {
  for (const node of nodes) {
    visit(node, ancestors);
    walkHierarchy(node.children, [...ancestors, node], visit);
  }
}

function nearest(ancestors: LegalNode[], kind: LegalNode["kind"]): LegalNode | null {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const node = ancestors[index];
    if (node?.kind === kind) {
      return node;
    }
  }
  return null;
}
