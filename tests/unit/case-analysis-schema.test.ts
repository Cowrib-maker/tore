import { describe, expect, it } from "vitest";

import {
  parseCaseAnalysisResponse,
  pruneUnusedCitations,
  remapSectionCitationRefs,
} from "@/application/case-ai/case-analysis-schema";
import { CASE_AI_ANALYSIS_SECTION_ORDER, type CaseAiCitation } from "@/domain/entities/case-ai-analysis";

function emptySections(): Record<string, unknown[]> {
  const sections: Record<string, unknown[]> = {};
  for (const key of CASE_AI_ANALYSIS_SECTION_ORDER) sections[key] = [];
  return sections;
}

function citation(overrides: Partial<CaseAiCitation> = {}): CaseAiCitation {
  return {
    citationType: "VERIFIED_LEGAL_SOURCE",
    title: "Иргэний хууль",
    reference: "art-1",
    excerpt: "excerpt",
    sourceUrl: null,
    sourceType: null,
    documentId: null,
    documentVersionId: null,
    nodeId: null,
    caseEvidenceId: null,
    ...overrides,
  };
}

describe("parseCaseAnalysisResponse", () => {
  it("rejects non-JSON text", () => {
    const result = parseCaseAnalysisResponse("this is prose, not json", 0);
    expect(result.ok).toBe(false);
  });

  it("rejects a JSON array instead of an object", () => {
    const result = parseCaseAnalysisResponse("[1,2,3]", 0);
    expect(result.ok).toBe(false);
  });

  it("rejects an object missing one of the nine required sections", () => {
    const sections = emptySections();
    delete sections.nextSteps;
    const result = parseCaseAnalysisResponse(JSON.stringify(sections), 0);
    expect(result.ok).toBe(false);
  });

  it("rejects a statement missing the required kind field", () => {
    const sections = emptySections();
    sections.briefCircumstances = [{ text: "no kind", citationRefs: [] }];
    const result = parseCaseAnalysisResponse(JSON.stringify(sections), 0);
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid kind value (not one of the four allowed)", () => {
    const sections = emptySections();
    sections.briefCircumstances = [{ kind: "OPINION", text: "x", citationRefs: [] }];
    const result = parseCaseAnalysisResponse(JSON.stringify(sections), 0);
    expect(result.ok).toBe(false);
  });

  it("strips a ```json code fence before parsing", () => {
    const raw = "```json\n" + JSON.stringify(emptySections()) + "\n```";
    const result = parseCaseAnalysisResponse(raw, 0);
    expect(result.ok).toBe(true);
  });

  it("strips a bare ``` code fence (no json tag) before parsing", () => {
    const raw = "```\n" + JSON.stringify(emptySections()) + "\n```";
    const result = parseCaseAnalysisResponse(raw, 0);
    expect(result.ok).toBe(true);
  });

  it("defaults citationRefs to an empty array when omitted", () => {
    const sections = emptySections();
    sections.legalRisks = [{ kind: "INFERENCE", text: "x" }];
    const result = parseCaseAnalysisResponse(JSON.stringify(sections), 5);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sections.legalRisks.statements[0]?.citationRefs).toEqual([]);
    }
  });

  it("drops a negative citationRef", () => {
    const sections = emptySections();
    sections.legalRisks = [{ kind: "INFERENCE", text: "x", citationRefs: [-1] }];
    const result = parseCaseAnalysisResponse(JSON.stringify(sections), 3);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sections.legalRisks.statements[0]?.citationRefs).toEqual([]);
    }
  });

  it("drops a citationRef equal to citationCount (off-by-one out of range)", () => {
    const sections = emptySections();
    sections.legalRisks = [{ kind: "INFERENCE", text: "x", citationRefs: [3] }];
    const result = parseCaseAnalysisResponse(JSON.stringify(sections), 3);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sections.legalRisks.statements[0]?.citationRefs).toEqual([]);
    }
  });

  it("keeps a duplicate valid citationRef as-is (parsing does not dedupe within a statement)", () => {
    const sections = emptySections();
    sections.legalRisks = [{ kind: "FACT", text: "x", citationRefs: [0, 0] }];
    const result = parseCaseAnalysisResponse(JSON.stringify(sections), 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sections.legalRisks.statements[0]?.citationRefs).toEqual([0, 0]);
      expect(result.usedCitationIndices.has(0)).toBe(true);
    }
  });

  it("preserves FACT/INFERENCE/UNCERTAINTY kinds without downgrading them", () => {
    const sections = emptySections();
    sections.briefCircumstances = [
      { kind: "FACT", text: "a", citationRefs: [] },
      { kind: "INFERENCE", text: "b", citationRefs: [] },
      { kind: "UNCERTAINTY", text: "c", citationRefs: [] },
    ];
    const result = parseCaseAnalysisResponse(JSON.stringify(sections), 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const kinds = result.sections.briefCircumstances.statements.map((s) => s.kind);
      expect(kinds).toEqual(["FACT", "INFERENCE", "UNCERTAINTY"]);
    }
  });

  it("preserves section order matching CASE_AI_ANALYSIS_SECTION_ORDER", () => {
    const result = parseCaseAnalysisResponse(JSON.stringify(emptySections()), 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.sections)).toEqual([...CASE_AI_ANALYSIS_SECTION_ORDER]);
    }
  });
});

describe("pruneUnusedCitations / remapSectionCitationRefs", () => {
  it("keeps only cited entries and preserves their relative order", () => {
    const citations = [citation({ title: "A" }), citation({ title: "B" }), citation({ title: "C" })];
    const { citations: pruned, remap } = pruneUnusedCitations(citations, new Set([2, 0]));
    expect(pruned.map((c) => c.title)).toEqual(["A", "C"]);
    expect(remap.get(0)).toBe(0);
    expect(remap.get(2)).toBe(1);
    expect(remap.has(1)).toBe(false);
  });

  it("returns an empty citations array when nothing was used", () => {
    const citations = [citation()];
    const { citations: pruned, remap } = pruneUnusedCitations(citations, new Set());
    expect(pruned).toEqual([]);
    expect(remap.size).toBe(0);
  });

  it("remaps statement citationRefs to the pruned indices and drops unmapped refs", () => {
    const sections = emptySections();
    sections.legalRisks = [{ kind: "FACT", text: "x", citationRefs: [0, 2] }];
    const parsed = parseCaseAnalysisResponse(JSON.stringify(sections), 3);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const citations = [citation({ title: "A" }), citation({ title: "B" }), citation({ title: "C" })];
    const { remap } = pruneUnusedCitations(citations, parsed.usedCitationIndices);
    const remapped = remapSectionCitationRefs(parsed.sections, remap);
    expect(remapped.legalRisks.statements[0]?.citationRefs).toEqual([0, 1]);
  });
});
