import { z } from "zod";

import {
  CASE_AI_ANALYSIS_SECTION_HEADINGS,
  CASE_AI_ANALYSIS_SECTION_ORDER,
  type CaseAiAnalysisSections,
  type CaseAiCitation,
  type CaseAnalysisSection,
} from "@/domain/entities/case-ai-analysis";

const statementSchema = z.object({
  kind: z.enum(["FACT", "LAW", "INFERENCE", "UNCERTAINTY"]),
  text: z.string().trim().min(1).max(2000),
  citationRefs: z.array(z.number().int()).max(20).default([]),
});

const sectionArraySchema = z.array(statementSchema).max(30);

const rawSectionsSchema = z.object(
  Object.fromEntries(
    CASE_AI_ANALYSIS_SECTION_ORDER.map((key) => [key, sectionArraySchema]),
  ) as Record<(typeof CASE_AI_ANALYSIS_SECTION_ORDER)[number], typeof sectionArraySchema>,
);

export type CaseAnalysisParseResult =
  | { ok: true; sections: CaseAiAnalysisSections; usedCitationIndices: Set<number> }
  | { ok: false; reason: string };

/**
 * Strips markdown code fences a model sometimes wraps JSON in
 * (```json ... ```), without attempting any other repair — a response that
 * still fails to parse after this is treated as a genuine failure, not
 * silently patched into something plausible-looking.
 */
function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

/**
 * Parses and validates the model's JSON response into the structured
 * CaseAiAnalysisSections shape. Any citationRef that does not index into
 * `citationCount` real, pre-built citations is dropped rather than kept —
 * the model cannot cause a fabricated citation to reach the client this
 * way, it can only cause its own reference to silently disappear.
 */
export function parseCaseAnalysisResponse(
  raw: string,
  citationCount: number,
): CaseAnalysisParseResult {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripCodeFence(raw));
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  const parsed = rawSectionsSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { ok: false, reason: "schema_mismatch" };
  }

  const usedCitationIndices = new Set<number>();
  const sections = {} as CaseAiAnalysisSections;
  for (const key of CASE_AI_ANALYSIS_SECTION_ORDER) {
    const statements = parsed.data[key].map((statement) => {
      const citationRefs = statement.citationRefs.filter((ref) => {
        const inRange = ref >= 0 && ref < citationCount;
        if (inRange) usedCitationIndices.add(ref);
        return inRange;
      });
      if (statement.kind === "LAW" && citationRefs.length === 0) {
        return { ...statement, kind: "UNCERTAINTY" as const, citationRefs };
      }
      return { ...statement, citationRefs };
    });
    const section: CaseAnalysisSection = {
      heading: CASE_AI_ANALYSIS_SECTION_HEADINGS[key],
      statements,
    };
    sections[key] = section;
  }

  return { ok: true, sections, usedCitationIndices };
}

/**
 * Trims the citations array down to only what the model actually grounded
 * a statement in — an unused VERIFIED_LEGAL_SOURCE or USER_DOCUMENT entry
 * stays out of the persisted/displayed citation panel entirely, so the
 * panel only ever shows sources the analysis text actually relies on.
 */
export function pruneUnusedCitations(
  citations: CaseAiCitation[],
  usedIndices: Set<number>,
): { citations: CaseAiCitation[]; remap: Map<number, number> } {
  const remap = new Map<number, number>();
  const pruned: CaseAiCitation[] = [];
  citations.forEach((citation, index) => {
    if (!usedIndices.has(index)) return;
    remap.set(index, pruned.length);
    pruned.push(citation);
  });
  return { citations: pruned, remap };
}

export function remapSectionCitationRefs(
  sections: CaseAiAnalysisSections,
  remap: Map<number, number>,
): CaseAiAnalysisSections {
  const next = {} as CaseAiAnalysisSections;
  for (const key of CASE_AI_ANALYSIS_SECTION_ORDER) {
    next[key] = {
      heading: sections[key].heading,
      statements: sections[key].statements.map((statement) => ({
        ...statement,
        citationRefs: statement.citationRefs
          .map((ref) => remap.get(ref))
          .filter((ref): ref is number => ref !== undefined),
      })),
    };
  }
  return next;
}
