import { stripLegalTemporalQueryPhrases } from "@/engine/knowledge/temporal/parse-legal-temporal-query-intent";

import { parseDottedPinpoint } from "./pinpoint";

export type DetectedExactCitation = {
  /** Phrase sent to the legal-data-engine as `citations[].query`. */
  query: string;
  titleHint: string;
  article: string;
  paragraph: string | null;
  locator: string;
};

/**
 * Detects a deterministic Mongolian statute pinpoint in user text.
 *
 * Aligns with the legal-data-engine exact-citation parser
 * (`parseExactCitationQuery`): title + «хуулийн» + article, optionally
 * dotted paragraph and «зүйл». Not NLP. Requires a law title and an
 * article number — a bare «17.1» is not enough.
 */
export function detectExactCitation(
  message: string,
): DetectedExactCitation | null {
  const normalized = stripLegalTemporalQueryPhrases(
    message.replace(/\s+/g, " ").trim(),
  );
  if (!normalized) {
    return null;
  }

  const withArticle = matchStatuteArticle(normalized);
  if (withArticle) {
    return withArticle;
  }

  return matchDottedStatute(normalized);
}

function matchStatuteArticle(text: string): DetectedExactCitation | null {
  const matches = text.matchAll(
    /([\p{L}][\p{L}\p{N}\s]{0,80}?)\s+хуулийн\s+(\d+)\s*(?:\.\s*(\d+))?\s*(?:дүгээр|дугаар|дэх)?\s*зүйл/giu,
  );
  let last: RegExpMatchArray | undefined;
  for (const match of matches) {
    last = match;
  }
  if (!last?.[1] || !last[2]) {
    return null;
  }
  return toDetected(last[0], last[1], last[2], last[3] ?? null);
}

function matchDottedStatute(text: string): DetectedExactCitation | null {
  const matches = text.matchAll(
    /([\p{L}][\p{L}\p{N}\s]{0,80}?)\s+хуулийн\s+(\d+)\.(\d+)/giu,
  );
  let last: RegExpMatchArray | undefined;
  for (const match of matches) {
    last = match;
  }
  if (!last?.[1] || !last[2] || !last[3]) {
    return null;
  }
  return toDetected(last[0], last[1], last[2], last[3]);
}

function toDetected(
  query: string,
  rawTitle: string,
  article: string,
  paragraph: string | null,
): DetectedExactCitation | null {
  const titleHint = rawTitle.replace(/\s+/g, " ").trim();
  if (titleHint.length < 2) {
    return null;
  }
  const pinpoint = parseDottedPinpoint(
    paragraph ? `${article}.${paragraph}` : article,
  );
  if (!pinpoint?.article) {
    return null;
  }
  const locator = paragraph
    ? `art-${pinpoint.article}/p-${paragraph}`
    : `art-${pinpoint.article}`;
  return {
    query: query.replace(/\s+/g, " ").trim(),
    titleHint,
    article: pinpoint.article,
    paragraph,
    locator,
  };
}
