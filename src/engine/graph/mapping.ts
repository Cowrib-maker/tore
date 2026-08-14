import {
  LegalCitationRole,
  LegalNodeKind,
  LegalRelationType,
  LegalSourceKind,
  type LegalCitationTarget,
  type LegalDocument,
  type LegalNode,
} from "../knowledge/schema";
import { GraphEdgeType, GraphNodeType } from "./types";

export function documentNodeType(document: LegalDocument): GraphNodeType {
  switch (document.source.kind) {
    case LegalSourceKind.LAW:
      return GraphNodeType.LAW;
    case LegalSourceKind.PROSECUTOR_GUIDELINE:
      return GraphNodeType.PROSECUTOR_GUIDELINE;
    case LegalSourceKind.GOVERNMENT_REGULATION:
      return GraphNodeType.GOVERNMENT_REGULATION;
    case LegalSourceKind.LEGAL_COMMENTARY:
      return GraphNodeType.LEGAL_COMMENTARY;
    case LegalSourceKind.SUPREME_COURT_DECISION:
      return document.source.decisionType === "RESOLUTION" ||
        document.source.decisionType === "INTERPRETATION"
        ? GraphNodeType.SUPREME_COURT_RESOLUTION
        : GraphNodeType.COURT_DECISION;
    default:
      return GraphNodeType.AUTHORITY;
  }
}

export function provisionNodeType(kind: LegalNode["kind"]): GraphNodeType {
  switch (kind) {
    case LegalNodeKind.ARTICLE:
      return GraphNodeType.ARTICLE;
    case LegalNodeKind.PARAGRAPH:
      return GraphNodeType.PARAGRAPH;
    case LegalNodeKind.SUBPARAGRAPH:
      return GraphNodeType.SUBPARAGRAPH;
    default:
      return GraphNodeType.PROVISION;
  }
}

export function edgeTypeFromCitationRole(
  role: LegalCitationRole,
): GraphEdgeType {
  switch (role) {
    case LegalCitationRole.CITES:
      return GraphEdgeType.CITES;
    case LegalCitationRole.AMENDS:
      return GraphEdgeType.AMENDS;
    case LegalCitationRole.REPEALS:
      return GraphEdgeType.REPEALS;
    case LegalCitationRole.IMPLEMENTS:
      return GraphEdgeType.IMPLEMENTS;
    case LegalCitationRole.INTERPRETS:
      return GraphEdgeType.INTERPRETS;
    case LegalCitationRole.FOLLOWS:
      return GraphEdgeType.APPLIES;
    default:
      return GraphEdgeType.RELATED_TO;
  }
}

export function edgeTypeFromRelation(
  type: LegalRelationType,
): GraphEdgeType {
  switch (type) {
    case LegalRelationType.CITES:
      return GraphEdgeType.CITES;
    case LegalRelationType.AMENDS:
      return GraphEdgeType.AMENDS;
    case LegalRelationType.REPEALS:
      return GraphEdgeType.REPEALS;
    case LegalRelationType.IMPLEMENTS:
      return GraphEdgeType.IMPLEMENTS;
    case LegalRelationType.INTERPRETS:
      return GraphEdgeType.INTERPRETS;
    case LegalRelationType.FOLLOWS:
      return GraphEdgeType.APPLIES;
    default:
      return GraphEdgeType.RELATED_TO;
  }
}

export function isUnresolvedTarget(
  target: LegalCitationTarget,
): boolean {
  return target.type === "UNRESOLVED";
}
