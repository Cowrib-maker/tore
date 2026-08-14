/**
 * Canonical legal document DTOs for TORE Legal AI.
 *
 * This is the semantic source-of-truth for every supported legal source.
 * It is independent of crawl/parse/chunk pipeline types in `types.ts`.
 *
 * Pipeline records (`RawKnowledgeDocument`, `KnowledgeChunk`, …) describe
 * ingestion mechanics. These DTOs describe legal meaning: identity,
 * hierarchy, and citations. See `schema.ts` for the canonical legal document.
 *
 * No runtime behavior lives here — types and constant maps only.
 */

/** Top-level source families TORE will ingest. */
export const LegalSourceKind = {
  LAW: "LAW",
  SUPREME_COURT_DECISION: "SUPREME_COURT_DECISION",
  PROSECUTOR_GUIDELINE: "PROSECUTOR_GUIDELINE",
  GOVERNMENT_REGULATION: "GOVERNMENT_REGULATION",
  LEGAL_COMMENTARY: "LEGAL_COMMENTARY",
} as const;

export type LegalSourceKind =
  (typeof LegalSourceKind)[keyof typeof LegalSourceKind];

/** Lifecycle of an instrument or decision. */
export const LegalDocumentStatus = {
  DRAFT: "DRAFT",
  IN_FORCE: "IN_FORCE",
  AMENDED: "AMENDED",
  REPEALED: "REPEALED",
  SUPERSEDED: "SUPERSEDED",
  UNKNOWN: "UNKNOWN",
} as const;

export type LegalDocumentStatus =
  (typeof LegalDocumentStatus)[keyof typeof LegalDocumentStatus];

/**
 * Structural roles inside {@link LegalDocument.hierarchy}.
 * One vocabulary covers codes, judgments, guidelines, and commentaries.
 */
export const LegalNodeKind = {
  BOOK: "BOOK",
  PART: "PART",
  TITLE: "TITLE",
  CHAPTER: "CHAPTER",
  SECTION: "SECTION",
  ARTICLE: "ARTICLE",
  PARAGRAPH: "PARAGRAPH",
  SUBPARAGRAPH: "SUBPARAGRAPH",
  ITEM: "ITEM",
  CLAUSE: "CLAUSE",
  ANNEX: "ANNEX",
  RECITAL: "RECITAL",
  HEADER: "HEADER",
  PARTIES: "PARTIES",
  PROCEDURAL_HISTORY: "PROCEDURAL_HISTORY",
  ISSUE: "ISSUE",
  HOLDING: "HOLDING",
  REASONING: "REASONING",
  DISPOSITION: "DISPOSITION",
  DISSENT: "DISSENT",
  DIRECTIVE: "DIRECTIVE",
  PROCEDURE: "PROCEDURE",
  COMMENT: "COMMENT",
  NOTE: "NOTE",
  BLOCK: "BLOCK",
} as const;

export type LegalNodeKind = (typeof LegalNodeKind)[keyof typeof LegalNodeKind];

/** How this document relates to another document. */
export const LegalRelationType = {
  AMENDS: "AMENDS",
  REPEALS: "REPEALS",
  SUPERSEDES: "SUPERSEDES",
  IMPLEMENTS: "IMPLEMENTS",
  INTERPRETS: "INTERPRETS",
  COMMENTS_ON: "COMMENTS_ON",
  FOLLOWS: "FOLLOWS",
  DISTINGUISHES: "DISTINGUISHES",
  CITES: "CITES",
} as const;

export type LegalRelationType =
  (typeof LegalRelationType)[keyof typeof LegalRelationType];

/** Direction of a citation from the quoting node/document. */
export const LegalCitationRole = {
  CITES: "CITES",
  IMPLEMENTS: "IMPLEMENTS",
  AMENDS: "AMENDS",
  REPEALS: "REPEALS",
  INTERPRETS: "INTERPRETS",
  COMMENTS_ON: "COMMENTS_ON",
  FOLLOWS: "FOLLOWS",
  DISTINGUISHES: "DISTINGUISHES",
} as const;

export type LegalCitationRole =
  (typeof LegalCitationRole)[keyof typeof LegalCitationRole];

/** Identifier namespaces for official and bibliographic keys. */
export const LegalIdentifierScheme = {
  LEGALINFO_LAW_ID: "LEGALINFO_LAW_ID",
  CASE_NUMBER: "CASE_NUMBER",
  REGULATION_NUMBER: "REGULATION_NUMBER",
  GUIDELINE_NUMBER: "GUIDELINE_NUMBER",
  DOCUMENT_NUMBER: "DOCUMENT_NUMBER",
  ISBN: "ISBN",
  OFFICIAL_URL: "OFFICIAL_URL",
  CUSTOM: "CUSTOM",
} as const;

export type LegalIdentifierScheme =
  (typeof LegalIdentifierScheme)[keyof typeof LegalIdentifierScheme];

/** One official or bibliographic identifier. */
export type LegalIdentifier = {
  scheme: LegalIdentifierScheme;
  value: string;
};

/**
 * Pinpoint within an instrument. Empty fields are omitted locators,
 * not unknown — use `display` to keep the original citation string.
 */
export type LegalLocator = {
  /** Original locator as printed, e.g. `17.1` or `Зүйл 17.1`. */
  display: string;
  book?: string;
  part?: string;
  chapter?: string;
  section?: string;
  article?: string;
  paragraph?: string;
  subparagraph?: string;
  item?: string;
  clause?: string;
  annex?: string;
  /** Residual pinpoint that does not fit the fields above. */
  pinpoint?: string;
};

/** Character offsets into a node's `text` (UTF-16 code units). */
export type LegalTextSpan = {
  start: number;
  end: number;
};

/**
 * Resolved or unresolved citation target.
 * Unresolved targets keep `rawText` until a later linker fills an id.
 */
export type LegalCitationTarget =
  | { type: "INTERNAL_NODE"; nodeId: string }
  | { type: "DOCUMENT"; documentId: string; locator?: LegalLocator }
  | { type: "EXTERNAL_AUTHORITY"; identifier: LegalIdentifier; locator?: LegalLocator }
  | { type: "UNRESOLVED"; rawText: string; locator?: LegalLocator };

/**
 * One citation. `rawText` is mandatory so the original wording is never lost.
 * Attach to a node via `fromNodeId`, or to the document when `fromNodeId` is null.
 */
export type LegalCitation = {
  id: string;
  rawText: string;
  role: LegalCitationRole;
  fromNodeId: string | null;
  target: LegalCitationTarget;
  span?: LegalTextSpan;
};

/** Cross-document relationship (amendment, commentary target, etc.). */
export type LegalDocumentRelation = {
  type: LegalRelationType;
  target: LegalCitationTarget;
};

/**
 * One node in the document tree.
 *
 * `text` is only the node's own wording. Child text lives on children so
 * hierarchy is not flattened. `path` is a stable, slash-delimited locator
 * from the root, e.g. `part-2/chapter-3/article-17/paragraph-1`.
 */
export type LegalNode = {
  id: string;
  kind: LegalNodeKind;
  locator: LegalLocator | null;
  heading: string | null;
  text: string | null;
  order: number;
  path: string;
  citations: LegalCitation[];
  children: LegalNode[];
};

/** Shared identity, independent of source family. */
export type LegalDocumentIdentity = {
  /** Canonical id inside TORE (stable across ingestions of the same official URL). */
  id: string;
  jurisdiction: string;
  language: string;
  title: string;
  shortTitle?: string;
  identifiers: LegalIdentifier[];
};

/** Issuance and official publication. Dates are ISO-8601 (`YYYY-MM-DD` or instant). */
export type LegalPublication = {
  issuer: string | null;
  officialUrl: string | null;
  documentNumber: string | null;
  issuedOn: string | null;
  publishedOn: string | null;
  publicationSeries: string | null;
};

/** Temporal validity of the instrument or decision. */
export type LegalTemporal = {
  status: LegalDocumentStatus;
  effectiveOn: string | null;
  validFrom: string | null;
  validTo: string | null;
};

/** Optional pointer back to archived original bytes. Not part of legal meaning. */
export type LegalProvenance = {
  sourceId: string | null;
  rawHtmlRef?: string;
  rawPdfRef?: string;
  checksum?: string;
};

export type LawBody = {
  kind: typeof LegalSourceKind.LAW;
  instrumentClass:
    | "CONSTITUTION"
    | "CODE"
    | "STATUTE"
    | "AMENDMENT"
    | "OTHER";
  enactingBody: string | null;
};

export type PartyRole = "APPLICANT" | "RESPONDENT" | "PROSECUTOR" | "DEFENDANT" | "OTHER";

export type LegalParty = {
  role: PartyRole;
  name: string;
};

export type SupremeCourtDecisionBody = {
  kind: typeof LegalSourceKind.SUPREME_COURT_DECISION;
  court: string;
  caseNumber: string;
  decisionType: "RESOLUTION" | "INTERPRETATION" | "APPEAL" | "OTHER";
  parties: LegalParty[];
  disposition: string | null;
};

export type ProsecutorGuidelineBody = {
  kind: typeof LegalSourceKind.PROSECUTOR_GUIDELINE;
  issuingOffice: string;
  guidelineNumber: string;
  audience: string | null;
};

export type GovernmentRegulationBody = {
  kind: typeof LegalSourceKind.GOVERNMENT_REGULATION;
  issuingBody: string;
  regulationNumber: string;
  /** Statute or decision this regulation is issued under. */
  enablingAuthority: LegalCitationTarget | null;
};

export type CommentaryAuthor = {
  name: string;
  role: "AUTHOR" | "EDITOR" | "TRANSLATOR" | "OTHER";
};

export type LegalCommentaryBody = {
  kind: typeof LegalSourceKind.LEGAL_COMMENTARY;
  authors: CommentaryAuthor[];
  workTitle: string | null;
  /** Instrument or case the commentary is written on. */
  commentedAuthority: LegalCitationTarget | null;
};

export type LegalSourceBody =
  | LawBody
  | SupremeCourtDecisionBody
  | ProsecutorGuidelineBody
  | GovernmentRegulationBody
  | LegalCommentaryBody;

/**
 * Canonical legal document.
 *
 * `hierarchy` is the ordered tree of provisions, holdings, directives, or
 * comments. `citations` holds document-level citations; node-level citations
 * live on {@link LegalNode.citations}. `relations` holds graph edges to
 * other documents (amendments, commentary targets) distinct from inline cites.
 */
export type LegalDocument = {
  identity: LegalDocumentIdentity;
  source: LegalSourceBody;
  publication: LegalPublication;
  temporal: LegalTemporal;
  hierarchy: LegalNode[];
  citations: LegalCitation[];
  relations: LegalDocumentRelation[];
  provenance?: LegalProvenance;
};
