import type { DetectedExactCitation } from "./parse-exact-citation-query";

export type CanonicalLawIdentity = {
  preferredLawIds: string[];
  titleTerms: string[];
  excludeTitleTerms: string[];
};

const CANONICAL = [
  {
    aliases: ["монгол улсын үндсэн", "үндсэн хууль"],
    lawId: "367",
    title: "МОНГОЛ УЛСЫН ҮНДСЭН ХУУЛЬ",
    exclude: ["цэц", "журам", "хавсралт", "нэмэлт"],
  },
  {
    aliases: ["эрүүгийн"],
    lawId: "11634",
    title: "ЭРҮҮГИЙН ХУУЛЬ",
    exclude: [],
  },
  {
    aliases: ["хөдөлмөрийн"],
    lawId: "565",
    title: "ХӨДӨЛМӨРИЙН ТУХАЙ ХУУЛЬ",
    exclude: [],
  },
  {
    aliases: ["үндсэн хуулийн цэц"],
    lawId: "365",
    title: "МОНГОЛ УЛСЫН ҮНДСЭН ХУУЛИЙН ЦЭЦИЙН ТУХАЙ",
    exclude: [],
  },
  {
    aliases: ["иргэний"],
    lawId: "299",
    title: "ИРГЭНИЙ ХУУЛЬ",
    exclude: [],
  },
] as const;

/**
 * Candidate law(s) for an open (non-exact-citation) legal question, keyed by
 * the coarse domain {@link inferLegalDomainFromText} infers from the
 * question text. Deliberately bounded to this same small, hand-verified
 * CANONICAL registry — never a free-text search — so a live official-source
 * lookup for an open question (see OfficialWebLegalCorpusRetriever) only
 * ever fetches one of these specific, known-good law pages. ADMINISTRATIVE
 * has no canonical entry yet, so it returns an empty list (an honest "no
 * candidate" rather than guessing at an unverified one). CIVIL covers both
 * "299" (Civil Code) and "565" (Labor Law) — matching DOMAIN_DOCUMENT_TYPES
 * in article-search.ts, which already groups LABOR_LAW documents under the
 * CIVIL domain for the same reason.
 */
const DOMAIN_CANDIDATE_LAW_IDS: Record<string, readonly string[]> = {
  CRIMINAL: ["11634"],
  CIVIL: ["299", "565"],
  ADMINISTRATIVE: [],
};

export function candidateLawIdsForDomain(domain: string | null): readonly string[] {
  if (!domain) {
    return [];
  }
  return DOMAIN_CANDIDATE_LAW_IDS[domain.toUpperCase()] ?? [];
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("mn-MN")
    .replace(/[“”«»]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+хуулийн$/iu, "");
}

export function resolveCanonicalLawIdentity(
  citation: Pick<DetectedExactCitation, "titleHint">,
): CanonicalLawIdentity {
  const hint = normalize(citation.titleHint);
  const match = CANONICAL.find((entry) =>
    entry.aliases.some((alias) => hint === normalize(alias) || hint.includes(normalize(alias))),
  );

  if (!match) {
    return {
      preferredLawIds: [],
      titleTerms: hint ? [citation.titleHint.trim()] : [],
      excludeTitleTerms: [],
    };
  }

  // The Constitutional Court law must win over the shorter "Үндсэн хууль" alias.
  if (match.lawId === "367" && /цэц/iu.test(hint)) {
    const court = CANONICAL.find((entry) => entry.lawId === "365");
    return {
      preferredLawIds: ["365"],
      titleTerms: court ? [court.title] : [citation.titleHint.trim()],
      excludeTitleTerms: [],
    };
  }

  return {
    preferredLawIds: [match.lawId],
    titleTerms: [match.title],
    excludeTitleTerms: [...match.exclude],
  };
}
