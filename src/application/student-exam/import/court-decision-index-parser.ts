import { createHash } from "node:crypto";

import type { ExamArea } from "@/domain/student/exam/types";

/**
 * Parses the table of contents of a "Supreme Court decisions by Criminal Code chapter" PDF into an INDEX of decisions
 * (date, case number, topic as written, page range). No decision text is copied or interpreted, and nothing is linked to a problem
 * automatically: the index is reference material for the student and for reviewers.
 */
export type CourtDecisionIndexEntry = {
  sourceKey: string;
  area: ExamArea;
  chapter: number | null;
  /** ISO date taken from the entry (yyyy-mm-dd); null when the entry's date could not be read. */
  courtDate: string | null;
  caseNumber: string | null;
  /** The topic exactly as written in the table of contents. */
  topic: string;
  pageFrom: number | null;
  pageTo: number | null;
  sourceFile: string;
};

const ENTRY =
  /Улсын\s+дээд\s+шүүхийн\s+(\d{4})\s+оны\s+(\d{1,2})\s+(?:дүгээр|дугаар|дүгэр)\s+сарын\s+(\d{1,2})-?\s*\S*\s+өдрийн\s+(\S+)\s+дуга\S*\s+тогтоол\.?\s*([(/][\s\S]{0,400}?[)/])\s*\.{3,}\s*(\d+)(?:\s*[-–]\s*(\d+))?/gu;

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Strips one pair of wrapping brackets/slashes that the table of contents puts around the topic. */
function cleanTopic(raw: string): string {
  let t = squash(raw);
  const pairs: Array<[string, string]> = [["(", ")"], ["/", "/"], ["«", "»"]];
  for (const [open, close] of pairs) {
    if (t.startsWith(open) && t.endsWith(close) && t.length > 2) {
      t = t.slice(1, -1).trim();
      break;
    }
  }
  return t;
}

export function chapterFromFileName(fileName: string): number | null {
  const m = /^(\d{1,2})-р\s+бүлэ/u.exec(fileName.normalize("NFC"));
  return m ? Number(m[1]) : null;
}

/**
 * Reads the table of contents across the first pages of a PDF: a page belongs to it while it still yields index entries, so
 * the decisions' own text on later pages is never mistaken for an entry. `leaderLines` counts the dotted-leader page references
 * found on those pages, which a reviewer can compare with the number of parsed entries.
 */
export function parseCourtDecisionIndexFromPages(
  pages: readonly string[],
  area: ExamArea,
  sourceFile: string,
): { entries: CourtDecisionIndexEntry[]; leaderLines: number; tocPages: number } {
  const entries: CourtDecisionIndexEntry[] = [];
  let leaderLines = 0;
  let tocPages = 0;
  for (let i = 0; i < pages.length; i++) {
    const found = parseCourtDecisionIndex(pages[i]!, area, sourceFile);
    if (found.length === 0 && i > 0) break;
    tocPages += 1;
    leaderLines += (pages[i]!.match(/\.{3,}\s*\d+/gu) ?? []).length;
    for (const e of found) if (!entries.some((x) => x.sourceKey === e.sourceKey)) entries.push(e);
  }
  return { entries, leaderLines, tocPages };
}

export function parseCourtDecisionIndex(
  tocText: string,
  area: ExamArea,
  sourceFile: string,
): CourtDecisionIndexEntry[] {
  const chapter = chapterFromFileName(sourceFile);
  const text = tocText.normalize("NFC");
  const out: CourtDecisionIndexEntry[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(ENTRY)) {
    const [, year, month, day, caseNumber, topicRaw, from, to] = m;
    const mm = Number(month);
    const dd = Number(day);
    const validDate = mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
    const pageFrom = Number(from);
    const pageTo = to ? Number(to) : pageFrom;
    const key = sha(`${sourceFile}|${caseNumber}|${pageFrom}|${year}-${month}-${day}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      sourceKey: key,
      area,
      chapter,
      courtDate: validDate ? `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}` : null,
      caseNumber: caseNumber ?? null,
      topic: cleanTopic(topicRaw ?? ""),
      pageFrom,
      pageTo,
      sourceFile,
    });
  }
  return out;
}
