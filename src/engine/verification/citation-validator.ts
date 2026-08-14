import type { CitationEntry, CitationIndex } from "../citation/types";
import { normalizeCitation } from "../citation/normalize";
import type { ReasoningAuthority, ReasoningPlan } from "../reasoning/types";
import type {
  ICitationValidator,
  ValidatorFinding,
  VerificationIssue,
  VerificationRequest,
} from "./types";

/**
 * Checks that every cited provision exists in a citation index
 * and resolves to a single entry.
 */
export class DefaultCitationValidator implements ICitationValidator {
  validate(request: VerificationRequest): ValidatorFinding {
    const indexes = asIndexes(request.citationIndex);
    const issues: VerificationIssue[] = [];
    const validatedCitations: string[] = [];
    const validatedAuthorities: string[] = [];
    const missingAuthorities: string[] = [];
    const seenQueries = new Set<string>();

    for (const citation of collectCitationQueries(request.plan)) {
      const key = normalizeCitation(citation.query);
      if (!key || seenQueries.has(key)) {
        continue;
      }
      seenQueries.add(key);
      const matches = resolveInIndexes(indexes, citation.query, citation.nodeId);
      if (matches.length === 0) {
        issues.push({
          code: "citation_unresolved",
          message: `Citation does not resolve: ${citation.query}`,
          severity: "error",
          citation: citation.query,
          authorityId: citation.nodeId ?? undefined,
        });
        if (citation.nodeId) {
          missingAuthorities.push(citation.nodeId);
        }
        continue;
      }
      if (matches.length > 1) {
        const nodeIds = unique(matches.map((item) => item.nodeId));
        if (nodeIds.length > 1) {
          issues.push({
            code: "citation_conflict",
            message: `Citation resolves to multiple nodes: ${citation.query}`,
            severity: "error",
            citation: citation.query,
          });
        }
      }
      const match = matches[0];
      if (match) {
        validatedCitations.push(match.canonical);
        validatedAuthorities.push(match.nodeId);
      }
    }

    return {
      issues,
      validatedAuthorities: unique(validatedAuthorities),
      validatedCitations: unique(validatedCitations),
      missingAuthorities: unique(missingAuthorities),
    };
  }
}

export function asIndexes(
  index: CitationIndex | readonly CitationIndex[],
): readonly CitationIndex[] {
  if (isCitationIndexArray(index)) {
    return [...index];
  }
  return [index];
}

function isCitationIndexArray(
  index: CitationIndex | readonly CitationIndex[],
): index is readonly CitationIndex[] {
  return Array.isArray(index);
}

function collectCitationQueries(
  plan: ReasoningPlan,
): { query: string; nodeId: string | null }[] {
  const items: { query: string; nodeId: string | null }[] = [];
  for (const authority of plan.relevantAuthorities) {
    if (authority.source === "citation") {
      items.push({ query: authority.label, nodeId: authority.id });
    }
  }
  for (const authority of plan.relatedArticles) {
    items.push({ query: authority.label, nodeId: authority.id });
  }
  for (const step of plan.reasoningSteps) {
    if (step.id !== "verify-citations") {
      continue;
    }
    for (const note of step.notes) {
      if (note.startsWith("unresolved:")) {
        items.push({ query: note.slice("unresolved:".length), nodeId: null });
      }
    }
    for (const id of step.collectedIds) {
      items.push({ query: id, nodeId: id });
    }
  }
  return items;
}

function resolveInIndexes(
  indexes: readonly CitationIndex[],
  query: string,
  nodeId: string | null,
): CitationEntry[] {
  const key = normalizeCitation(query);
  const matches: CitationEntry[] = [];
  for (const index of indexes) {
    for (const entry of index.entries) {
      if (nodeId && entry.nodeId === nodeId) {
        matches.push(entry);
        continue;
      }
      if (normalizeCitation(entry.canonical) === key) {
        matches.push(entry);
        continue;
      }
      if (entry.aliases.some((alias) => normalizeCitation(alias) === key)) {
        matches.push(entry);
      }
    }
  }
  return uniqueByNode(matches);
}

function uniqueByNode(entries: CitationEntry[]): CitationEntry[] {
  const seen = new Set<string>();
  const result: CitationEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.nodeId)) {
      continue;
    }
    seen.add(entry.nodeId);
    result.push(entry);
  }
  return result;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function allPlanAuthorities(plan: ReasoningPlan): ReasoningAuthority[] {
  return uniqueById([
    ...plan.relevantAuthorities,
    ...plan.relatedArticles,
    ...plan.relatedCases,
  ]);
}

function uniqueById(items: ReasoningAuthority[]): ReasoningAuthority[] {
  const seen = new Set<string>();
  const result: ReasoningAuthority[] = [];
  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    result.push(item);
  }
  return result;
}
