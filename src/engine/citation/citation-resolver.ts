import { grammarForDocument } from "./grammars";
import { normalizeCitation } from "./normalize";
import { dottedPinpoint, parseDottedPinpoint } from "./pinpoint";
import { buildCitationIndex } from "./build-index";
import type { CitationEntry, CitationGrammar, CitationIndex } from "./types";
import type { LegalDocument } from "../knowledge/schema";

/**
 * Deterministic citation lookup over one {@link CitationIndex}.
 * All aliases of a node resolve to that same entry.
 */
export class CitationResolver {
  private readonly byNodeId = new Map<string, CitationEntry>();
  private readonly byCitation = new Map<string, CitationEntry>();
  private readonly byDotted = new Map<string, CitationEntry>();

  constructor(readonly index: CitationIndex) {
    for (const entry of index.entries) {
      this.byNodeId.set(entry.nodeId, entry);
      this.registerCitation(entry.canonical, entry);
      for (const alias of entry.aliases) {
        this.registerCitation(alias, entry);
      }
      const dotted = dottedPinpoint(entry.pinpoint);
      if (dotted) {
        const dottedKey = normalizeCitation(dotted);
        if (!this.byDotted.has(dottedKey)) {
          this.byDotted.set(dottedKey, entry);
        }
      }
    }
  }

  static fromDocument(
    document: LegalDocument,
    grammar?: CitationGrammar,
  ): CitationResolver {
    return new CitationResolver(
      buildCitationIndex(document, grammar ?? grammarForDocument(document)),
    );
  }

  find(nodeId: string): CitationEntry | null {
    return this.byNodeId.get(nodeId) ?? null;
  }

  findByCitation(citation: string): CitationEntry | null {
    const key = normalizeCitation(citation);
    if (!key) {
      return null;
    }
    return this.byCitation.get(key) ?? this.lookupDotted(key);
  }

  /**
   * Resolves a citation string, or a longer text that contains one.
   * Prefers an exact alias match, then the longest indexed alias found in `text`.
   */
  resolve(text: string): CitationEntry | null {
    const exact = this.findByCitation(text);
    if (exact) {
      return exact;
    }
    const haystack = normalizeCitation(text);
    if (!haystack) {
      return null;
    }
    let best: { length: number; entry: CitationEntry } | null = null;
    for (const [key, entry] of this.byCitation) {
      if (!containsCitation(haystack, key)) {
        continue;
      }
      if (!best || key.length > best.length) {
        best = { length: key.length, entry };
      }
    }
    return best?.entry ?? this.lookupDottedFromText(haystack);
  }

  private registerCitation(citation: string, entry: CitationEntry): void {
    const key = normalizeCitation(citation);
    if (!key || this.byCitation.has(key)) {
      return;
    }
    this.byCitation.set(key, entry);
  }

  private lookupDotted(key: string): CitationEntry | null {
    const pinpoint = parseDottedPinpoint(key);
    if (!pinpoint) {
      return null;
    }
    const dotted = dottedPinpoint(pinpoint);
    if (!dotted) {
      return null;
    }
    return this.byDotted.get(normalizeCitation(dotted)) ?? null;
  }

  private lookupDottedFromText(haystack: string): CitationEntry | null {
    const matches = haystack.match(/\d+(?:\.\d+){0,3}/g);
    if (!matches || matches.length === 0) {
      return null;
    }
    const longest = matches.reduce((a, b) => (a.length >= b.length ? a : b));
    return this.lookupDotted(longest);
  }
}

function containsCitation(haystack: string, key: string): boolean {
  if (!haystack.includes(key)) {
    return false;
  }
  if (!/^\d+(?:\.\d+){0,3}$/.test(key)) {
    return true;
  }
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^0-9.])${escaped}([^0-9.]|$)`).test(haystack);
}
