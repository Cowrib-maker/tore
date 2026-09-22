import { describe, expect, it } from "vitest";

import { formatTemporalValidityBlock } from "@/application/ai/legal-ai-temporal-validity-block";
import type { ResolvedLegalAuthority } from "@/application/ai/resolve-legal-authorities";

const baseAuthority: ResolvedLegalAuthority = {
  title: "Хөдөлмөр эрхлэлтийг дэмжих тухай",
  locator: "art-1",
  excerpt: "excerpt",
  documentId: "doc-563",
  documentVersionId: "ver-1",
  nodeId: "node-1",
  effectiveFrom: null,
  effectiveTo: null,
  sourceUrl: null,
  sourceVersion: null,
  article: "1",
  paragraph: null,
  sourceType: "legal-data-engine",
};

describe("formatTemporalValidityBlock", () => {
  it("returns undefined when no authority has a flagged status", () => {
    const block = formatTemporalValidityBlock([
      { ...baseAuthority, temporalValidity: { status: "IN_FORCE", effectiveFrom: "1992-01-01", effectiveUntil: null, basis: "SOURCE_DATES", evidence: [], uncertainty: null, repealChain: null } },
    ]);
    expect(block).toBeUndefined();
  });

  it("returns undefined when temporalValidity is absent (graph repository not supplied)", () => {
    const block = formatTemporalValidityBlock([{ ...baseAuthority, temporalValidity: null }]);
    expect(block).toBeUndefined();
  });

  it("flags a REPEALED authority with its title and evidence-based caveat, never silently drops it", () => {
    const block = formatTemporalValidityBlock([
      {
        ...baseAuthority,
        temporalValidity: {
          status: "REPEALED",
          effectiveFrom: null,
          effectiveUntil: null,
          basis: "EXPLICIT_REPEAL_DATE_UNKNOWN",
          evidence: ["real repeal declaration text"],
          uncertainty: "effective date not established",
          repealChain: null,
        },
      },
    ]);
    expect(block).toBeDefined();
    expect(block).toContain(baseAuthority.title);
    expect(block).toContain("хүчингүй болсон");
    expect(block).toContain("түүхэн асуултад хариулахдаа");
  });

  it("does not flag HISTORICALLY_IN_FORCE, EXPIRED, or REPEALED authorities as unqualified current law, but still allows historical use per the caveat text", () => {
    const block = formatTemporalValidityBlock([
      { ...baseAuthority, temporalValidity: { status: "HISTORICALLY_IN_FORCE", effectiveFrom: "2000-01-01", effectiveUntil: "2010-01-01", basis: "HISTORICAL_DATE_RANGE", evidence: [], uncertainty: null, repealChain: null } },
    ]);
    expect(block).toContain("түүхэн хугацаанд хүчинтэй байсныг нотолсон");
  });

  it("only lists flagged authorities, never a plain IN_FORCE one, in a mixed set", () => {
    const block = formatTemporalValidityBlock([
      { ...baseAuthority, title: "Still current", temporalValidity: { status: "IN_FORCE", effectiveFrom: "1992-01-01", effectiveUntil: null, basis: "SOURCE_DATES", evidence: [], uncertainty: null, repealChain: null } },
      { ...baseAuthority, title: "Repealed one", temporalValidity: { status: "REPEALED", effectiveFrom: null, effectiveUntil: null, basis: "EXPLICIT_REPEAL_DATE_UNKNOWN", evidence: [], uncertainty: null, repealChain: null } },
    ]);
    expect(block).toContain("Repealed one");
    expect(block).not.toContain("Still current");
  });
});
