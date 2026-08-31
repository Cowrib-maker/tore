/**
 * Identify priority statutes from LegalInfo discovery titles.
 * Does not hard-code lawIds. Does not ingest.
 */

export type PriorityLawKey =
  | "constitution"
  | "criminal_code"
  | "civil_code"
  | "admin_procedure"
  | "admin_general"
  | "related_regulation";

export type PriorityLawDiscoveryDocument = {
  lawId: string;
  officialUrl: string;
  title: string | null;
};

export type PriorityLawMatch = PriorityLawDiscoveryDocument & {
  key: PriorityLawKey;
};

export type IdentifyPriorityLawsResult = {
  /** All title matches grouped by key (may be ambiguous). */
  byKey: Record<PriorityLawKey, PriorityLawMatch[]>;
  /** Keys with exactly one match — safe to ingest. */
  unambiguous: PriorityLawMatch[];
  /** Keys with 0 matches. */
  missing: PriorityLawKey[];
  /** Keys with 2+ matches — do not invent which one. */
  ambiguous: PriorityLawKey[];
};

const AMENDMENT = /нэмэлт|өөрчлөлт/i;

const RULES: ReadonlyArray<{
  key: PriorityLawKey;
  match: (title: string) => boolean;
}> = [
  {
    key: "constitution",
    match: (title) =>
      /үндсэн\s+хууль/i.test(title) &&
      !/цэц/i.test(title) &&
      !AMENDMENT.test(title),
  },
  {
    key: "criminal_code",
    match: (title) =>
      /эрүүгийн\s+хууль/i.test(title) &&
      !/байцаан\s+шийтгэх/i.test(title) &&
      !AMENDMENT.test(title),
  },
  {
    key: "civil_code",
    match: (title) =>
      /иргэний\s+хууль/i.test(title) &&
      !/хэрэг\s+шийтгэх/i.test(title) &&
      !/байцаан/i.test(title) &&
      !AMENDMENT.test(title),
  },
  {
    key: "admin_procedure",
    match: (title) => {
      if (AMENDMENT.test(title)) return false;
      if (/зхшхштх|зхштх|zxshth/i.test(title)) return true;
      return (
        /захиргааны\s+хэрэг\s+шийдвэрлэх\s+тухай\s+хууль/i.test(title) ||
        /захиргааны\s+хэргийг\s+шийдвэрлэх\s+тухай\s+хууль/i.test(title) ||
        /захиргааны\s+хэрэг\s+шийдвэрлэх\s+тухай/i.test(title) ||
        /захиргааны\s+хэрэг\s+шүүхэд\s+хянан\s+шийдвэрлэх\s+тухай/i.test(title)
      );
    },
  },
  {
    key: "admin_general",
    match: (title) => {
      if (AMENDMENT.test(title)) return false;
      // Avoid ASCII `\b` — Cyrillic tokens are not word chars without `u`.
      if (/(^|[^a-zа-яёөү])зех([^a-zа-яёөү]|$)/i.test(title)) return true;
      return /захиргааны\s+ерөнхий\s+хууль/i.test(title);
    },
  },
  {
    key: "related_regulation",
    match: (title) => {
      if (!/(дүрэм|журам)/i.test(title)) return false;
      if (AMENDMENT.test(title)) return false;
      // Only regulations clearly tied to core domains — avoid flooding.
      return /(эрүүгийн|иргэний|захиргааны|үндсэн\s+хууль)/i.test(title);
    },
  },
];

const ALL_KEYS: PriorityLawKey[] = RULES.map((rule) => rule.key);

export function classifyPriorityLawTitle(
  title: string | null | undefined,
): PriorityLawKey | null {
  const normalized = (title ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  for (const rule of RULES) {
    if (rule.key === "related_regulation") continue;
    if (rule.match(normalized)) return rule.key;
  }
  const regulation = RULES.find((rule) => rule.key === "related_regulation");
  if (regulation?.match(normalized)) return "related_regulation";
  return null;
}

/**
 * Scan discovery documents for priority statute titles.
 * Callers must only ingest {@link IdentifyPriorityLawsResult.unambiguous}.
 */
export function identifyPriorityLawsFromDocuments(
  documents: readonly PriorityLawDiscoveryDocument[],
): IdentifyPriorityLawsResult {
  const byKey = Object.fromEntries(
    ALL_KEYS.map((key) => [key, [] as PriorityLawMatch[]]),
  ) as Record<PriorityLawKey, PriorityLawMatch[]>;

  for (const document of documents) {
    const key = classifyPriorityLawTitle(document.title);
    if (!key) continue;
    byKey[key].push({ ...document, key });
  }

  // Cap related_regulation noise: keep at most 5 shortest-title hits.
  if (byKey.related_regulation.length > 5) {
    byKey.related_regulation = byKey.related_regulation
      .slice()
      .sort(
        (a, b) =>
          (a.title?.length ?? 999) - (b.title?.length ?? 999) ||
          a.lawId.localeCompare(b.lawId, "en", { numeric: true }),
      )
      .slice(0, 5);
  }

  // Prefer current consolidated texts when discovery lists multiple editions.
  for (const key of [
    "criminal_code",
    "civil_code",
    "admin_procedure",
    "admin_general",
  ] as const) {
    byKey[key] = preferRevisedEdition(byKey[key]);
  }

  const unambiguous: PriorityLawMatch[] = [];
  const missing: PriorityLawKey[] = [];
  const ambiguous: PriorityLawKey[] = [];

  for (const key of ALL_KEYS) {
    const rows = byKey[key];
    if (rows.length === 0) {
      missing.push(key);
    } else if (rows.length === 1) {
      unambiguous.push(rows[0]!);
    } else if (key === "related_regulation") {
      // Multiple related regulations are expected — all capped rows are OK.
      unambiguous.push(...rows);
    } else {
      ambiguous.push(key);
    }
  }

  return { byKey, unambiguous, missing, ambiguous };
}

/**
 * When several editions share a code title, keep the “шинэчилсэн найруулга”
 * row if exactly one exists — still discovery-derived, not a hard-coded id.
 */
function preferRevisedEdition(
  matches: PriorityLawMatch[],
): PriorityLawMatch[] {
  if (matches.length <= 1) return matches;
  const revised = matches.filter((row) =>
    /шинэчилсэн\s+найруулга/i.test(row.title ?? ""),
  );
  return revised.length === 1 ? revised : matches;
}

export function priorityLawIdsForIngest(
  result: IdentifyPriorityLawsResult,
): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const row of result.unambiguous) {
    if (seen.has(row.lawId)) continue;
    seen.add(row.lawId);
    ids.push(row.lawId);
  }
  return ids;
}
