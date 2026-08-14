import type {
  GraphNeighborInput,
  IReasoningContextBuilder,
  ReasoningAuthority,
  ReasoningContext,
  ReasoningRequest,
  RetrievedDocumentInput,
} from "./types";

const ARTICLE_KINDS = new Set([
  "ARTICLE",
  "PARAGRAPH",
  "SUBPARAGRAPH",
  "PROVISION",
  "ITEM",
]);

const CASE_KINDS = new Set([
  "COURT_DECISION",
  "SUPREME_COURT_RESOLUTION",
  "CASE",
]);

const GUIDELINE_KINDS = new Set(["PROSECUTOR_GUIDELINE", "GUIDELINE"]);

/**
 * Assembles a country-agnostic {@link ReasoningContext} from engine inputs.
 */
export class DefaultReasoningContextBuilder implements IReasoningContextBuilder {
  build(request: ReasoningRequest): ReasoningContext {
    const question = request.question.trim();
    const citations = request.citations;
    const verifiedCitations = citations.filter((item) => item.resolved);
    const unresolvedCitations = citations.filter((item) => !item.resolved);

    const fromCitations = verifiedCitations.flatMap((item) => {
      if (!item.nodeId) {
        return [];
      }
      return [
        authority(
          item.nodeId,
          item.kind ?? "AUTHORITY",
          item.canonical ?? item.query,
          "citation",
        ),
      ];
    });
    const fromDocuments = request.documents.map((doc) =>
      authority(doc.id, doc.kind, doc.title, "document"),
    );
    const fromNeighbors = request.graphNeighbors.map((neighbor) =>
      authority(neighbor.nodeId, neighbor.type, neighbor.label, "graph"),
    );
    const authorities = uniqueAuthorities([
      ...fromCitations,
      ...fromDocuments,
      ...fromNeighbors,
    ]);

    return {
      question,
      intent: request.intent,
      legalIssue: question,
      citations,
      verifiedCitations,
      unresolvedCitations,
      documents: request.documents,
      graphNeighbors: request.graphNeighbors,
      authorities,
      articles: authorities.filter((item) => ARTICLE_KINDS.has(item.kind)),
      cases: authorities.filter((item) => CASE_KINDS.has(item.kind)),
      guidelines: authorities.filter((item) => GUIDELINE_KINDS.has(item.kind)),
      missingInformation: missingInformation({
        question,
        intentType: request.intent.type,
        intentConfidence: request.intent.confidence,
        unresolvedCitations: unresolvedCitations.map((item) => item.query),
        documents: request.documents,
        neighbors: request.graphNeighbors,
        articles: authorities.filter((item) => ARTICLE_KINDS.has(item.kind)),
        cases: authorities.filter((item) => CASE_KINDS.has(item.kind)),
      }),
    };
  }
}

function authority(
  id: string,
  kind: string,
  label: string,
  source: ReasoningAuthority["source"],
): ReasoningAuthority {
  return { id, kind, label, source };
}

function uniqueAuthorities(
  items: ReasoningAuthority[],
): ReasoningAuthority[] {
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

function missingInformation(input: {
  question: string;
  intentType: string;
  intentConfidence: number;
  unresolvedCitations: string[];
  documents: RetrievedDocumentInput[];
  neighbors: GraphNeighborInput[];
  articles: ReasoningAuthority[];
  cases: ReasoningAuthority[];
}): string[] {
  const gaps: string[] = [];
  if (!input.question) {
    gaps.push("question");
  }
  if (!input.intentType || input.intentType === "UNKNOWN") {
    gaps.push("intent");
  }
  if (input.intentConfidence < 0.5 && input.intentType !== "UNKNOWN") {
    gaps.push("intent_confidence");
  }
  if (input.unresolvedCitations.length > 0) {
    gaps.push("unresolved_citations");
  }
  if (input.documents.length === 0 && input.articles.length === 0) {
    gaps.push("primary_authority");
  }
  if (needsCourtAuthority(input.intentType) && input.cases.length === 0) {
    gaps.push("court_authority");
  }
  if (input.neighbors.length === 0 && input.documents.length === 0) {
    gaps.push("graph_context");
  }
  return gaps;
}

function needsCourtAuthority(intentType: string): boolean {
  return /CASE|COURT|LITIGATION/i.test(intentType);
}
