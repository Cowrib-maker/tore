/**
 * Safe citation metadata returned to Legal AI clients.
 * Never includes archive hashes, engine tokens, storage keys, or node internals.
 */

import { stripLegalHtmlTags } from "@/engine/knowledge/repository/article-search";

export type LegalAiSafeCitation = {
  id: string;
  sourceType: string;
  title: string;
  article: string | null;
  paragraph: string | null;
  sourceUrl: string | null;
  sourceVersion: string | null;
  validFrom: string | null;
  validTo: string | null;
};

export type LegalAiCitationPersistInput = {
  title: string;
  sourceType: string;
  sourceUrl?: string | null;
  reference?: string | null;
  excerpt?: string | null;
  article?: string | null;
  paragraph?: string | null;
  sourceVersion?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
};

export function citationPinpointFromLocator(locator: string | null | undefined): {
  article: string | null;
  paragraph: string | null;
} {
  if (!locator) {
    return { article: null, paragraph: null };
  }
  const match = locator.trim().match(/^art-([^/]+)(?:\/p-(.+))?$/i);
  if (!match?.[1]) {
    return { article: null, paragraph: null };
  }
  return {
    article: match[1],
    paragraph: match[2] ?? null,
  };
}

export function nullIfBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function stripCitationHtml(value: string): string {
  return stripLegalHtmlTags(value);
}

export function toSafeLegalAiCitation(
  id: string,
  input: LegalAiCitationPersistInput,
): LegalAiSafeCitation {
  const pinpoint = citationPinpointFromLocator(
    typeof input.reference === "string" ? input.reference.split(" | ")[0] : null,
  );
  return {
    id,
    sourceType: input.sourceType,
    title: stripCitationHtml(input.title),
    article: nullIfBlank(input.article) ?? pinpoint.article,
    paragraph: nullIfBlank(input.paragraph) ?? pinpoint.paragraph,
    sourceUrl: nullIfBlank(input.sourceUrl),
    sourceVersion: nullIfBlank(input.sourceVersion),
    validFrom: nullIfBlank(input.validFrom),
    validTo: nullIfBlank(input.validTo),
  };
}

export function parseSafeCitationsFromUnknown(
  value: unknown,
): LegalAiSafeCitation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const citations: LegalAiSafeCitation[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.title !== "string") {
      continue;
    }
    citations.push({
      id: row.id,
      sourceType: typeof row.sourceType === "string" ? row.sourceType : "legal-source",
      title: stripCitationHtml(row.title),
      article: typeof row.article === "string" ? nullIfBlank(row.article) : null,
      paragraph:
        typeof row.paragraph === "string" ? nullIfBlank(row.paragraph) : null,
      sourceUrl:
        typeof row.sourceUrl === "string" ? nullIfBlank(row.sourceUrl) : null,
      sourceVersion:
        typeof row.sourceVersion === "string"
          ? nullIfBlank(row.sourceVersion)
          : null,
      validFrom:
        typeof row.validFrom === "string" ? nullIfBlank(row.validFrom) : null,
      validTo: typeof row.validTo === "string" ? nullIfBlank(row.validTo) : null,
    });
  }
  return citations;
}
