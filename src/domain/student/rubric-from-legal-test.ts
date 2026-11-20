/**
 * Written-exam rubric, DERIVED from a LegalTest — never hand-authored.
 *
 * One rubric item per LegalElement. Nothing here invents a grading
 * criterion: label, description, and provenance are copied verbatim from
 * the element that already exists in the source-backed doctrine catalog
 * (`engine/doctrine/frameworks/*`). This function only reshapes data —
 * it does not touch LegalTest or LegalElement.
 */
import type { DoctrineProvenance } from "@/engine/doctrine";
import type { LegalElement, LegalTest } from "@/engine/doctrine";

export type WrittenExamRubricItem = {
  elementId: string;
  label: string;
  description: string;
  required: boolean;
  order: number;
  provenance: readonly DoctrineProvenance[];
  weight: number;
};

/**
 * Equal-weight distribution across all elements by default (100 / count,
 * remainder assigned to the first N elements so weights sum exactly to
 * 100) — a domain can supply its own `weightFor` to bias particular
 * elements without inventing new criteria.
 */
export function buildRubricFromLegalTest(
  test: LegalTest,
  options: { weightFor?: (element: LegalElement) => number } = {},
): WrittenExamRubricItem[] {
  const elements = [...test.elements].sort((a, b) => a.order - b.order);
  if (elements.length === 0) {
    return [];
  }

  if (options.weightFor) {
    return elements.map((element) => toRubricItem(element, options.weightFor!(element)));
  }

  const base = Math.floor(100 / elements.length);
  const remainder = 100 - base * elements.length;
  return elements.map((element, index) =>
    toRubricItem(element, base + (index < remainder ? 1 : 0)),
  );
}

export function maxWrittenExamRubricTotal(
  rubric: readonly WrittenExamRubricItem[],
): number {
  return rubric.reduce((total, item) => total + item.weight, 0);
}

function toRubricItem(element: LegalElement, weight: number): WrittenExamRubricItem {
  return {
    elementId: element.id,
    label: element.label,
    description: element.description,
    required: element.required,
    order: element.order,
    provenance: element.provenance,
    weight,
  };
}
