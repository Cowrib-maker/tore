/**
 * Canonical intermediate document.
 *
 * Source adapters emit this shape. Legal parsers consume it.
 * Nothing here is website-specific (no HTML selectors, no hostnames).
 */

import type {
  LegalDocument,
  LegalDocumentIdentity,
  LegalProvenance,
  LegalPublication,
  LegalSourceKind,
  LegalTemporal,
  LawBody,
} from "./schema";

/** Instrument family the outline describes. */
export const CanonicalInstrumentKind = {
  LAW: "LAW",
  COURT: "COURT",
  REGULATION: "REGULATION",
  COMMENTARY: "COMMENTARY",
} as const;

export type CanonicalInstrumentKind =
  (typeof CanonicalInstrumentKind)[keyof typeof CanonicalInstrumentKind];

/** One outline row after source-specific markup has been stripped. */
export const CanonicalUnitRole = {
  PART: "PART",
  CHAPTER: "CHAPTER",
  SECTION: "SECTION",
  ARTICLE: "ARTICLE",
  PARAGRAPH: "PARAGRAPH",
  SUBPARAGRAPH: "SUBPARAGRAPH",
  ITEM: "ITEM",
  TEXT: "TEXT",
} as const;

export type CanonicalUnitRole =
  (typeof CanonicalUnitRole)[keyof typeof CanonicalUnitRole];

export type CanonicalOutlineUnit = {
  role: CanonicalUnitRole;
  /** Original wording of this unit. Never summarized or translated. */
  text: string;
  display: string;
  heading: string | null;
  number: string | null;
  article?: string;
  paragraph?: string;
  subparagraph?: string;
  item?: string;
};

/**
 * Source-agnostic document ready for an {@link ILegalParser}.
 * Adapters fill identity, dates, and outline; parsers build LegalDocument.
 */
export type CanonicalSourceDocument = {
  instrumentKind: CanonicalInstrumentKind;
  sourceKind: LegalSourceKind;
  identity: LegalDocumentIdentity;
  publication: LegalPublication;
  temporal: LegalTemporal;
  provenance?: LegalProvenance;
  /** Used as the root of LegalNode.path. */
  outlinePathPrefix: string;
  outline: CanonicalOutlineUnit[];
  law?: {
    instrumentClass: LawBody["instrumentClass"];
    enactingBody: string | null;
  };
};

/** Bytes or markup as received from a source. Adapters interpret this. */
export type SourceAdapterInput = {
  html?: string;
  pdf?: Uint8Array;
  text?: string;
  officialUrl?: string;
};

export interface ISourceAdapter {
  readonly adapterId: string;
  readonly jurisdiction: string;
  adapt(input: SourceAdapterInput): CanonicalSourceDocument;
}

export interface ILegalParser {
  readonly instrumentKind: CanonicalInstrumentKind;
  parse(document: CanonicalSourceDocument): LegalDocument;
}
