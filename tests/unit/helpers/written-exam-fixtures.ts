/**
 * Small, domain-agnostic LegalTest fixture shared by the written-exam /
 * AI-tutor test suite — deliberately NOT administrative doctrine, so these
 * tests exercise the pipeline itself, independent of any one legal domain.
 */
import { LegalAuthorityKind, emptyTemporal } from "@/engine/doctrine";
import type { DoctrineProvenance, LegalTest } from "@/engine/doctrine";

export function fixtureProvenance(sourceId: string): DoctrineProvenance {
  return {
    sourceId,
    sourceKind: LegalAuthorityKind.DOCTRINE,
    citation: `Fixture treatise ${sourceId}`,
    locator: "§1",
  };
}

export function fixtureWrittenExamTest(): LegalTest {
  return {
    id: "test:fixture-written-exam",
    name: "Fixture two-element written-exam test",
    doctrineId: "doctrine:fixture",
    ruleId: null,
    elements: [
      {
        id: "fixture:element:alpha",
        label: "Element Alpha",
        description: "The first required element of the fixture test. It must be shown clearly.",
        required: true,
        order: 1,
        conceptId: null,
        temporal: emptyTemporal(),
        provenance: [fixtureProvenance("fixture:source-1")],
      },
      {
        id: "fixture:element:beta",
        label: "Element Beta",
        description: "The second required element of the fixture test.",
        required: true,
        order: 2,
        conceptId: null,
        temporal: emptyTemporal(),
        provenance: [fixtureProvenance("fixture:source-2")],
      },
    ],
    temporal: emptyTemporal({ sourceVersion: "fixture-v1" }),
    provenance: [fixtureProvenance("fixture:source-1")],
  };
}
