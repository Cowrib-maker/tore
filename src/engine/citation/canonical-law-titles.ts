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
