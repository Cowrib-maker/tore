/**
 * Identify the Criminal Code (Эрүүгийн хууль) lawId from LegalInfo discovery
 * output. Does not hard-code a lawId and does not ingest anything.
 */

export type CriminalCodeDiscoveryDocument = {
  lawId: string;
  officialUrl: string;
  title: string | null;
};

export type CriminalCodeTitleClass =
  | "match"
  | "procedure"
  | "amendment"
  | "unrelated";

export type CriminalCodeDiscoveryMatch = CriminalCodeDiscoveryDocument & {
  titleClass: "match";
};

export type CriminalCodeDiscoverySkip = {
  lawId: string;
  officialUrl: string;
  title: string | null;
  titleClass: Exclude<CriminalCodeTitleClass, "match" | "unrelated">;
};

export type IdentifyCriminalCodeResult = {
  matches: CriminalCodeDiscoveryMatch[];
  skippedRelated: CriminalCodeDiscoverySkip[];
};

const CRIMINAL_CODE_TITLE = /эрүүгийн\s+хууль/i;
const CRIMINAL_PROCEDURE = /байцаан\s+шийтгэх/i;
const AMENDMENT = /нэмэлт|өөрчлөлт/i;

export function classifyCriminalCodeTitle(
  title: string | null | undefined,
): CriminalCodeTitleClass {
  const normalized = (title ?? "").replace(/\s+/g, " ").trim();
  if (!normalized || !/эрүүгийн/i.test(normalized)) {
    return "unrelated";
  }
  if (CRIMINAL_PROCEDURE.test(normalized)) {
    return "procedure";
  }
  if (!CRIMINAL_CODE_TITLE.test(normalized)) {
    return "unrelated";
  }
  if (AMENDMENT.test(normalized)) {
    return "amendment";
  }
  return "match";
}

/**
 * Scan discovery documents (manifest rows or list items) for Criminal Code
 * titles. Returns every remaining match — the caller must not invent a lawId
 * when the set is empty or ambiguous.
 */
export function identifyCriminalCodeFromDocuments(
  documents: readonly CriminalCodeDiscoveryDocument[],
): IdentifyCriminalCodeResult {
  const matches: CriminalCodeDiscoveryMatch[] = [];
  const skippedRelated: CriminalCodeDiscoverySkip[] = [];

  for (const document of documents) {
    const titleClass = classifyCriminalCodeTitle(document.title);
    if (titleClass === "match") {
      matches.push({ ...document, titleClass });
      continue;
    }
    if (titleClass === "procedure" || titleClass === "amendment") {
      skippedRelated.push({
        lawId: document.lawId,
        officialUrl: document.officialUrl,
        title: document.title,
        titleClass,
      });
    }
  }

  return { matches, skippedRelated };
}
