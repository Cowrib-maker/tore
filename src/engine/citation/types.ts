/**
 * Contracts for the TORE Citation Engine.
 *
 * Indexes a {@link LegalDocument} into deterministic citations.
 * Independent of crawl/parse adapters and of Gateway.
 */

import type { LegalLocator, LegalNodeKind } from "../knowledge/schema";

/** Structural pinpoint shared by every jurisdiction. */
export type CanonicalPinpoint = {
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
};

export type CitationFormatInput = {
  instrumentTitle: string;
  kind: LegalNodeKind;
  pinpoint: CanonicalPinpoint;
  locator: LegalLocator | null;
  path: string;
  heading: string | null;
  text: string | null;
};

/**
 * Jurisdiction-specific wording. The indexer and resolver stay agnostic;
 * plug in a grammar per language without changing lookup.
 */
export type CitationGrammar = {
  id: string;
  formatCanonical(input: CitationFormatInput): string;
  formatAliases(input: CitationFormatInput): string[];
};

export type CitationEntry = {
  nodeId: string;
  documentId: string;
  kind: LegalNodeKind;
  canonical: string;
  aliases: string[];
  pinpoint: CanonicalPinpoint;
  path: string;
};

export type CitationIndex = {
  documentId: string;
  documentTitle: string;
  jurisdiction: string;
  language: string;
  grammarId: string;
  entries: CitationEntry[];
};
