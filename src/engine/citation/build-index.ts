import type { LegalDocument, LegalNode } from "../knowledge/schema";
import { grammarForDocument } from "./grammars";
import { uniqueStrings } from "./normalize";
import { dottedPinpoint, locatorToPinpoint, mergePinpoint } from "./pinpoint";
import type {
  CanonicalPinpoint,
  CitationEntry,
  CitationGrammar,
  CitationIndex,
} from "./types";

export function buildCitationIndex(
  document: LegalDocument,
  grammar: CitationGrammar = grammarForDocument(document),
): CitationIndex {
  const instrumentTitle =
    document.identity.shortTitle ?? document.identity.title;
  const entries: CitationEntry[] = [];

  for (const node of document.hierarchy) {
    collectEntries(node, {}, document.identity.id, instrumentTitle, grammar, entries);
  }

  return {
    documentId: document.identity.id,
    documentTitle: document.identity.title,
    jurisdiction: document.identity.jurisdiction,
    language: document.identity.language,
    grammarId: grammar.id,
    entries,
  };
}

function collectEntries(
  node: LegalNode,
  inherited: CanonicalPinpoint,
  documentId: string,
  instrumentTitle: string,
  grammar: CitationGrammar,
  entries: CitationEntry[],
): void {
  const pinpoint = mergePinpoint(inherited, locatorToPinpoint(node.locator));
  const input = {
    instrumentTitle,
    kind: node.kind,
    pinpoint,
    locator: node.locator,
    path: node.path,
    heading: node.heading,
    text: node.text,
  };
  const canonical = grammar.formatCanonical(input);
  const dotted = dottedPinpoint(pinpoint);
  const aliases = uniqueStrings([
    canonical,
    node.locator?.display ?? "",
    dotted ?? "",
    ...grammar.formatAliases(input),
  ]);

  entries.push({
    nodeId: node.id,
    documentId,
    kind: node.kind,
    canonical,
    aliases,
    pinpoint,
    path: node.path,
  });

  for (const child of node.children) {
    collectEntries(child, pinpoint, documentId, instrumentTitle, grammar, entries);
  }
}
